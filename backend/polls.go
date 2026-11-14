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
}

type Vote struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"id"`
	PollID      bson.ObjectID `bson:"pollId" json:"pollId"`
	VoterID     string        `bson:"voterId" json:"voterId"`
	OptionIndex int           `bson:"optionIndex" json:"optionIndex"`
	CreatedAt   time.Time     `bson:"createdAt" json:"createdAt"`
}

type CreatePollRequest struct {
	Question string   `json:"question" binding:"required,min=5,max=200"`
	Options  []string `json:"options" binding:"required,min=2,max=10"`
}

type CastVoteRequest struct {
	VoterID     string `json:"voterId" binding:"required,min=8,max=100"`
	OptionIndex int    `json:"optionIndex" binding:"gte=0"`
}

func CreatePoll(c *gin.Context) {
	creatorID := c.GetString("userID")
	if creatorID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Please log in"})
		return
	}

	var req CreatePollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Enter a question and at least two options"})
		return
	}

	if len(req.Options) < 2 || len(req.Options) > 10 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "A poll must have between 2 and 10 options"})
		return
	}

	for i, option := range req.Options {
		req.Options[i] = strings.TrimSpace(option)
		if req.Options[i] == "" || len(req.Options[i]) > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Each option must contain 1–100 characters"})
			return
		}
	}

	poll := Poll{
		ID:        bson.NewObjectID(),
		CreatorID: creatorID,
		Question:  strings.TrimSpace(req.Question),
		Options:   req.Options,
		CreatedAt: time.Now(),
		IsActive:  true,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := PollsCollection.InsertOne(ctx, poll)
	if err != nil {
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

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

	c.JSON(http.StatusOK, gin.H{"success": true, "poll": poll})
}

func CastVote(c *gin.Context) {
	pollID, err := bson.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid poll ID"})
		return
	}

	var req CastVoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Provide a voter ID and valid option"})
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

	if !poll.IsActive {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "This poll is closed"})
		return
	}

	if req.OptionIndex < 0 || req.OptionIndex >= len(poll.Options) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid option"})
		return
	}

	vote := Vote{
		ID:          bson.NewObjectID(),
		PollID:      pollID,
		VoterID:     req.VoterID,
		OptionIndex: req.OptionIndex,
		CreatedAt:   time.Now(),
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

	// MongoDB is the permanent vote store. Redis keeps the fast live count.
	redisKey := "poll:" + pollID.Hex() + ":option:" + string(rune(req.OptionIndex+'0'))
	count, redisErr := RedisClient.Incr(ctx, redisKey).Result()

	// If Redis is temporarily unavailable, rebuild this option's count from MongoDB.
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
