
package main

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type User struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"id"`
	Name         string        `bson:"name" json:"name"`
	Email        string        `bson:"email" json:"email"`
	PasswordHash string        `bson:"passwordHash" json:"-"`
	CreatedAt    time.Time     `bson:"createdAt" json:"createdAt"`
}

type RegisterRequest struct {
	Name     string `json:"name" binding:"required,min=2,max=60"`
	Email    string `json:"email" binding:"required,email,max=254"`
	Password string `json:"password" binding:"required,min=8,max=72"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}
