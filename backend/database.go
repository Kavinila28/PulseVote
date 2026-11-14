
package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
)

var MongoClient *mongo.Client
var RedisClient *redis.Client

func ConnectMongoDB() error {
	uri := os.Getenv("MONGODB_URI")
	database := os.Getenv("MONGODB_DATABASE")

	if uri == "" || database == "" {
		return fmt.Errorf("MongoDB environment variables are missing")
	}

	ctx, cancel := context.WithTimeout(
		context.Background(), 15*time.Second,
	)
	defer cancel()

	client, err := mongo.Connect(
		options.Client().ApplyURI(uri),
	)
	if err != nil {
		return fmt.Errorf("MongoDB connection error: %w", err)
	}

	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		_ = client.Disconnect(context.Background())
		return fmt.Errorf("MongoDB ping failed: %w", err)
	}

	MongoClient = client
	log.Println("MongoDB connected successfully")

	return nil
}

func ConnectRedis() error {
	addr := os.Getenv("REDIS_ADDR")
	password := os.Getenv("REDIS_PASSWORD")
	username := os.Getenv("REDIS_USERNAME")

	if addr == "" {
		return fmt.Errorf("Redis address is missing")
	}

	redisOptions := &redis.Options{
		Addr:     addr,
		Username: username,
		Password: password,
		DB:       0,
	}

	if os.Getenv("REDIS_TLS") == "true" {
		redisOptions.TLSConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
		}
	}

	client := redis.NewClient(redisOptions)

	ctx, cancel := context.WithTimeout(
		context.Background(), 10*time.Second,
	)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return fmt.Errorf("Redis ping failed: %w", err)
	}

	RedisClient = client
	log.Println("Redis connected successfully")

	return nil
}
