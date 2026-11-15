# PulseVote — Real-Time Polling Platform

**Create polls. Cast your vote. See results live.**

PulseVote is a full-stack, real-time polling application that allows users to create polls, share them with others, cast votes, and monitor results as they happen. It combines a responsive React frontend with a Go-based REST API, MongoDB persistence, and Redis-powered real-time functionality.

## Live Application

- **Frontend:** https://pulsevote.hostless.site
- **Backend API:** https://pulsevote-api.hostless.app
- **GitHub Repository:** https://github.com/Kavinila28/PulseVote

## Key Features

- **User Authentication:** Secure registration and login using JWT-based authentication.
- **Poll Creation:** Create polls with multiple voting options.
- **Poll Participation:** Cast votes through an intuitive interface.
- **Duplicate Vote Protection:** Prevent users from voting more than once in a poll.
- **Live Results:** View updated voting results in real time.
- **Real-Time Communication:** WebSocket-based updates supported by Redis.
- **Persistent Storage:** Store user accounts, polls, and voting records in MongoDB.
- **Responsive Interface:** Access the application across desktop and mobile screen sizes.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript |
| UI | CSS, Lucide React |
| Backend | Go, Gin |
| Database | MongoDB |
| Real-Time Layer | Redis, WebSockets |
| Authentication | JWT |
| Deployment | Hostless |
| Development | GitHub Codespaces, Git |

## System Architecture

```text
                 USERS
                   |
                   v
          React + Vite Frontend
                   |
             HTTP / WebSocket
                   |
                   v
             Go + Gin API
              /         \
             v           v
         MongoDB        Redis
       Persistent     Real-time
         Data          Updates
             \           /
              \         /
               Live Results
```

### Architecture Overview

1. The React frontend communicates with the Go backend through HTTP API requests and WebSocket connections.
2. The Gin backend handles authentication, poll management, voting, and validation.
3. MongoDB stores application data, including users, polls, and votes.
4. Redis supports real-time coordination and voting updates.
5. WebSocket communication delivers live updates to connected clients.

## Project Structure

```text
PulseVote/
│
├── backend/
│   ├── main.go
│   ├── polls.go
│   ├── realtime.go
│   ├── go.mod
│   └── ...
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── ...
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

## Getting Started

### Prerequisites

Install the following before running the project locally:

- Go
- Node.js and npm
- MongoDB
- Redis
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/Kavinila28/PulseVote.git
cd PulseVote
```

### 2. Configure the Backend

```bash
cd backend
```

Create a `.env` file using the configuration below. Replace the placeholder values with your own credentials.

```env
MONGODB_URI=your_mongodb_connection_string
MONGODB_DATABASE=pulsevote

JWT_SECRET=your_secure_jwt_secret

REDIS_ADDR=localhost:6379
REDIS_USERNAME=default
REDIS_PASSWORD=your_redis_password
REDIS_TLS=false

GIN_MODE=debug
FRONTEND_URL=http://localhost:5173
```

Keep credentials private. Never commit `.env` files or production secrets to GitHub.

Install dependencies and start the backend:

```bash
go mod download
go run .
```

### 3. Configure the Frontend

Open a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite will display the local development URL in the terminal.

### 4. Build for Production

```bash
npm run build
```

The optimized production build will be generated in the `frontend/dist` directory.

## Core Application Modules

| Module | Responsibility |
|---|---|
| Authentication | User registration, login, and protected access |
| Poll Management | Poll creation and management |
| Voting | Vote submission and validation |
| Results | Vote aggregation and result display |
| Real-Time Updates | WebSocket communication and Redis integration |
| Data Persistence | MongoDB storage and retrieval |

## Security and Validation

PulseVote incorporates:

- JWT-based authentication.
- Backend-side request validation.
- Protected application operations.
- Duplicate voting prevention.
- Environment-based configuration for sensitive credentials.

## Deployment

The application is deployed as two separate services:

| Service | Deployment URL |
|---|---|
| Frontend | https://pulsevote.hostless.site |
| Backend | https://pulsevote-api.hostless.app |

The frontend communicates with the deployed backend API, while MongoDB and Redis provide persistent storage and real-time infrastructure.

## Future Improvements

Potential enhancements include:

- Advanced poll analytics and visualizations.
- Poll scheduling and expiration controls.
- Enhanced moderation and administration tools.
- Additional accessibility improvements.
- More detailed activity and participation reports.

## Project Information

**Project:** PulseVote  
**Category:** Full-Stack Web Application  
**Purpose:** Real-Time Online Polling  
**Developed for:** GUVI–HCL Full Stack Developer Selection Project  
**Repository:** [Kavinila28/PulseVote](https://github.com/Kavinila28/PulseVote)

---

*PulseVote — Making every vote count, in real time.*
