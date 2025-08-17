# 🏆 Sports Club Server

A Node.js and Express-based backend server for managing court bookings, user roles, secure payments, and member approvals in a sports club management system.

This server powers the full-stack Sports Club web app with secure RESTful APIs, user authentication (JWT), Stripe integration, and MongoDB-based data management.

---

## 🔗 Live Links

- **Frontend**: [https://champion-club1.netlify.app](https://champion-club1.netlify.app)
- **Backend (API Base URL)**: [https://sports-club-server.vercel.app](https://sports-club-server.vercel.app)

---

## 🔧 Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT
- **Payment**: Stripe
- **Other Tools**: dotenv, CORS, Express middleware

---

## 🚀 Key Features

- 🔐 User Authentication (JWT-based)
- 👥 Role-Based Access Control (Admin, Member, User)
- 🏟️ Court Booking System with Slot Management
- 💳 Stripe Payment Integration
- 📬 Member Status Update After Payment
- 🧾 Admin Approval Workflow
- 🔄 RESTful API Endpoints
- 🌐 Deployed on Vercel (Backend) and Firebase (Frontend)

---

## 📸 Screenshot

![Sports Club Server Screenshot](https://images.unsplash.com/photo-1707664635804-5cdd900a754e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8c3BvcnRzJTIwY291cnRzfGVufDB8fDB8fHww)

> Example: Server running locally with `/api/courts` endpoint in Postman.

---

## 🛠️ Setup Instructions

1. **Clone the repository**
```bash
git clone https://github.com/your-username/sports-club-server.git
cd sports-club-server
npm install
nodemon index.js
