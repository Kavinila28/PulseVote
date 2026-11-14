package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func main() {
	// Load environment variables
	_ = godotenv.Load()

	// Connect to MongoDB
	if err := ConnectMongoDB(); err != nil {
		log.Fatal("MongoDB connection failed: ", err)
	}

	// Connect to Redis
	if err := ConnectRedis(); err != nil {
		log.Fatal("Redis connection failed: ", err)
	}

	// Close database connections when server stops
	defer func() {
		_ = MongoClient.Disconnect(context.Background())
		_ = RedisClient.Close()
	}()

	database := os.Getenv("MONGODB_DATABASE")
	if database == "" {
		log.Fatal("MONGODB_DATABASE is missing in .env")
	}

	// Initialize MongoDB collections
	db := MongoClient.Database(database)

	UsersCollection = db.Collection("users")
	PollsCollection = db.Collection("polls")
	VotesCollection = db.Collection("votes")

	// Create unique email index
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)

	_, err := UsersCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})

	cancel()

	if err != nil {
		log.Fatal("Could not create email index: ", err)
	}

	// Create unique voter-per-poll index
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)

	_, err = VotesCollection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{
			{Key: "pollId", Value: 1},
			{Key: "voterId", Value: 1},
		},
		Options: options.Index().SetUnique(true),
	})

	cancel()

	if err != nil {
		log.Fatal("Could not create vote index: ", err)
	}

	// Configure Gin
	gin.SetMode(gin.ReleaseMode)

	router := gin.Default()
	router.SetTrustedProxies(nil)

	// CORS configuration
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	})

	// Health check
	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "PulseVote backend is running!",
			"mongodb": "connected",
			"redis":   "connected",
		})
	})

	// Authentication routes
	auth := router.Group("/api/auth")
	{
		auth.POST("/register", Register)
		auth.POST("/login", Login)
		auth.GET("/me", AuthMiddleware(), GetProfile)
	}

	// Poll routes
	polls := router.Group("/api/polls")
	{
		polls.POST("", AuthMiddleware(), CreatePoll)
		polls.GET("", ListPolls)
		polls.GET("/:id", GetPoll)
		polls.POST("/:id/vote", CastVote)
		polls.GET("/:id/results", GetPollResults)
	}

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Println("PulseVote server starting on port", port)

	if err := router.Run("0.0.0.0:" + port); err != nil {
		log.Fatal("Server failed: ", err)
	}
}
