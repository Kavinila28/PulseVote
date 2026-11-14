package main

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var PollsCollection *mongo.Collection
var VotesCollection *mongo.Collection

type Poll struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"id"`
	CreatorID string        `bson:"creatorId" json:"creatorId"`
	Question  string        `bson:"question" json:"question"`
	Options   []string      `bson:"options" json:"options"`
	CreatedAt time.Time     `bson:"createdAt" json:"createdAt"`
	IsActive  bool          `bson:"isActive" json:"isActive"`
	ExpiresAt *time.Time    `bson:"expiresAt,omitempty" json:"expiresAt,omitempty"`
}

type CreatePollRequest struct {
	Question  string     `json:"question" binding:"required,min=5,max=200"`
	Options   []string   `json:"options" binding:"required,min=2,max=10"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type CastVoteRequest struct {
	OptionIndex int `json:"optionIndex" binding:"gte=0"`
}

func validateOptions(options []string) ([]string, bool) {
	if len(options) < 2 || len(options) > 10 {
		return nil, false
	}

	clean := make([]string, len(options))
	seen := make(map[string]bool)

	for i, option := range options {
		option = strings.TrimSpace(option)
		if option == "" || len(option) > 100 {
			return nil, false
		}

		key := strings.ToLower(option)
		if seen[key] {
			return nil, false
		}
		seen[key] = true
		clean[i] = option
	}

	return clean, true
}

func expirePollIfNeeded(ctx context.Context, poll *Poll) error {
	if poll.IsActive && poll.ExpiresAt != nil && !poll.ExpiresAt.After(time.Now()) {
		_, err := PollsCollection.UpdateOne(
			ctx,
			bson.M{"_id": poll.ID, "isActive": true},
			bson.M{"$set": bson.M{"isActive": false}},
		)
		if err != nil {
			return err
		}
		poll.IsActive = false
	}
	return nil
}

func CreatePoll(c *gin.Context) {
	creatorID := c.GetString("userID")
	if creatorID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Please log in"})
		return
	}

	var req CreatePollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Enter a valid question and at least two options"})
		return
	}

	options, valid := validateOptions(req.Options)
	if !valid {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Options must be unique, non-empty, and between 1 and 100 characters. Add 2–10 options."})
		return
	}

	if req.ExpiresAt != nil && !req.ExpiresAt.After(time.Now()) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Expiry time must be in the future"})
		return
	}

	poll := Poll{
		ID:        bson.NewObjectID(),
		CreatorID: creatorID,
		Question:  strings.TrimSpace(req.Question),
		Options:   options,
		CreatedAt: time.Now(),
		IsActive:  true,
		ExpiresAt: req.ExpiresAt,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := PollsCollection.InsertOne(ctx, poll); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not create poll"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"message": "Poll created successfully",
		"poll":    poll,
	})
}

func ListPolls(c *gin.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	// Mark expired polls inactive without deleting their results.
	_, err := PollsCollection.UpdateMany(
		ctx,
		bson.M{
			"isActive":  true,
			"expiresAt": bson.M{"$lte": time.Now()},
		},
		bson.M{"$set": bson.M{"isActive": false}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not update expired polls"})
		return
	}

	cursor, err := PollsCollection.Find(
		ctx,
		bson.M{},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not load polls"})
		return
	}
	defer cursor.Close(ctx)

	polls := []Poll{}
	if err := cursor.All(ctx, &polls); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not read polls"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "polls": polls})
}

func GetPoll(c *gin.Context) {
	pollID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid poll ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var poll Poll
	err = PollsCollection.FindOne(ctx, bson.M{"_id": pollID}).Decode(&poll)
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Poll not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not load poll"})
		return
	}

	if err := expirePollIfNeeded(ctx, &poll); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not check poll expiry"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "poll": poll})
}

func CastVote(c *gin.Context) {
	pollID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid poll ID"})
		return
	}

	// The authenticated account is the voter identity.
	voterID := c.GetString("userID")
	if voterID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Please log in to vote"})
		return
	}

	var req CastVoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Provide a valid option"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	var poll Poll
	if err := PollsCollection.FindOne(ctx, bson.M{"_id": pollID}).Decode(&poll); err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Poll not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not load poll"})
		return
	}

	if err := expirePollIfNeeded(ctx, &poll); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not check poll expiry"})
		return
	}

	if !poll.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "This poll is closed"})
		return
	}

	if req.OptionIndex < 0 || req.OptionIndex >= len(poll.Options) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid option"})
		return
	}

	// Recheck active status in the vote insert path to reduce close/vote races.
	stillActive, err := PollsCollection.CountDocuments(ctx, bson.M{
		"_id":      pollID,
		"isActive": true,
		"$or": []bson.M{
			{"expiresAt": bson.M{"$exists": false}},
			{"expiresAt": nil},
			{"expiresAt": bson.M{"$gt": time.Now()}},
		},
	})
	if err != nil || stillActive == 0 {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "This poll is closed or expired"})
		return
	}

	vote := bson.M{
		"_id":         bson.NewObjectID(),
		"pollId":      pollID,
		"voterId":     voterID,
		"optionIndex": req.OptionIndex,
		"createdAt":   time.Now(),
	}

	_, err = VotesCollection.InsertOne(ctx, vote)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": "You have already voted in this poll"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not save vote"})
		return
	}

	redisKey := "poll:" + pollID.Hex() + ":option:" + string(rune(req.OptionIndex+'0'))
	count, redisErr := RedisClient.Incr(ctx, redisKey).Result()
	if redisErr != nil {
		count, err = VotesCollection.CountDocuments(ctx, bson.M{
			"pollId":      pollID,
			"optionIndex": req.OptionIndex,
		})
		if err == nil {
			_ = RedisClient.Set(ctx, redisKey, count, 0).Err()
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"message": "Vote recorded successfully",
		"count":   count,
	})
}

func ClosePoll(c *gin.Context) {
	updatePollStatus(c, false)
}

func updatePollStatus(c *gin.Context, active bool) {
	pollID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid poll ID"})
		return
	}

	creatorID := c.GetString("userID")
	if creatorID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Please log in"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := PollsCollection.UpdateOne(
		ctx,
		bson.M{"_id": pollID, "creatorId": creatorID, "isActive": !active},
		bson.M{"$set": bson.M{"isActive": active}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not update poll"})
		return
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Poll not found, not yours, or already in that state"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Poll closed successfully"})
}

func UpdatePoll(c *gin.Context) {
	pollID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid poll ID"})
		return
	}

	creatorID := c.GetString("userID")
	var req CreatePollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Enter a valid question and options"})
		return
	}

	options, valid := validateOptions(req.Options)
	if !valid {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Options must be unique and contain 2–10 valid choices"})
		return
	}
	if req.ExpiresAt != nil && !req.ExpiresAt.After(time.Now()) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Expiry time must be in the future"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	voteCount, err := VotesCollection.CountDocuments(ctx, bson.M{"pollId": pollID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not check existing votes"})
		return
	}
	if voteCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "A poll cannot be edited after voting has started"})
		return
	}

	result, err := PollsCollection.UpdateOne(
		ctx,
		bson.M{"_id": pollID, "creatorId": creatorID, "isActive": true},
		bson.M{"$set": bson.M{
			"question":  strings.TrimSpace(req.Question),
			"options":   options,
			"expiresAt": req.ExpiresAt,
		}},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not update poll"})
		return
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Active poll not found or you are not its creator"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Poll updated successfully"})
}

func DeletePoll(c *gin.Context) {
	pollID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid poll ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	voteCount, err := VotesCollection.CountDocuments(ctx, bson.M{"pollId": pollID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not check existing votes"})
		return
	}
	if voteCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "Polls with votes cannot be deleted. Close the poll to preserve its results."})
		return
	}

	result, err := PollsCollection.DeleteOne(ctx, bson.M{
		"_id":       pollID,
		"creatorId": c.GetString("userID"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not delete poll"})
		return
	}
	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Poll not found or you are not its creator"})
		return
	}

	for i := 0; i < 10; i++ {
		key := "poll:" + pollID.Hex() + ":option:" + string(rune(i+'0'))
		_ = RedisClient.Del(ctx, key).Err()
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Poll deleted successfully"})
}

func GetPollResults(c *gin.Context) {
	pollID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid poll ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	var poll Poll
	if err := PollsCollection.FindOne(ctx, bson.M{"_id": pollID}).Decode(&poll); err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Poll not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not load poll"})
		return
	}

	results := make([]gin.H, len(poll.Options))
	for i, option := range poll.Options {
		key := "poll:" + pollID.Hex() + ":option:" + string(rune(i+'0'))
		count, redisErr := RedisClient.Get(ctx, key).Int64()

		if redisErr != nil {
			count, err = VotesCollection.CountDocuments(ctx, bson.M{
				"pollId":      pollID,
				"optionIndex": i,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not load results"})
				return
			}
			_ = RedisClient.Set(ctx, key, count, 0).Err()
		}

		results[i] = gin.H{"option": option, "votes": count}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "results": results})
}
