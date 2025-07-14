# 🍽️ MealGiver Server API

The **MealGiver Server** is the core API service for the MealGiver platform — a MERN stack-based food donation and redistribution system connecting restaurants with verified charities and individuals to reduce food waste.

---

## 🔗 Live Server

> ⚙️ Base URL: `https://mealgiver-server.vercel.app`

---


## ⚙️ Technologies Used

- **Node.js**
- **Express.js**
- **MongoDB**
- **Firebase Admin SDK (Authentication & Role Management)**
- **Stripe API (Payments)**
- **Dotenv**
- **CORS**
- **Firebase Token Verification**




---

## 🔐 Authentication & Middleware

- **Firebase Authentication** (`verifyFBToken`)
- **Role-based Authorization** (`verifyAdmin`, `verifyRestaurant`, `verifyCharity`)

---

## 🔑 ENV Configuration

```env
PORT=5000
# 🔑 ENV Configuration (Example)
PORT=
DB_USER=
DB_PASS=
STRIPE_SECRET_KEY=
# Firebase Admin SDK (JSON as string)
FB_SERVICE_KEY=

```

## 🛠️ Base URL

> `https://mealgiver-server.vercel.app`

---

## ✅ Auth & User Endpoints

| Method   | Endpoint             | Access        | Description                |
| -------- | -------------------- | ------------- | -------------------------- |
| `GET`    | `/users`             | Admin         | Get all users              |
| `POST`   | `/users`             | Public        | Register a new user        |
| `PATCH`  | `/users/role/:email` | Admin         | Update a user’s role       |
| `DELETE` | `/users/:id`         | Admin         | Delete a user              |
| `GET`    | `/users/role/:email` | Authenticated | Get current user's role    |

---

## 🍽️ Donations Endpoints

| Method   | Endpoint                 | Access     | Description                        |
| -------- | ------------------------ | ---------- | ---------------------------------- |
| `POST`   | `/donations`             | Restaurant | Create a new donation              |
| `GET`    | `/donations/restaurant`  | Restaurant | Get all donations by restaurant    |
| `PATCH`  | `/donations/:id`         | Restaurant | Update a donation                  |
| `DELETE` | `/donations/:id`         | Restaurant | Delete a donation                  |
| `GET`    | `/donations/featured`    | Public     | Get featured donations             |
| `GET`    | `/donations/verified`    | Public     | Get all verified donations         |
| `GET`    | `/donations/:id`         | Public     | Get donation details               |
| `PATCH`  | `/donations/approve/:id` | Admin      | Approve a donation submission      |

---

## 📦 Donation Request Endpoints

| Method  | Endpoint                          | Access     | Description                                  |
| ------- | --------------------------------- | ---------- | -------------------------------------------- |
| `POST`  | `/requests`                       | Charity    | Submit request for a donation                |
| `GET`   | `/requests/charity`               | Charity    | Get all requests by the logged-in charity    |
| `GET`   | `/requests/restaurant`            | Restaurant | Get all requests for restaurant’s donations  |
| `PATCH` | `/requests/:id/approve`           | Restaurant | Approve a charity’s request                  |
| `PATCH` | `/requests/:id/reject`            | Restaurant | Reject a charity’s request                   |
| `GET`   | `/charity/received-donations`     | Charity    | Get all received/picked-up donations         |
| `GET`   | `/charity/latest-requests/recent` | Public     | Get recent charity requests (for homepage)   |

---

## 🚚 Pickup Confirmation Endpoints

| Method  | Endpoint                      | Access  | Description              |
| ------- | ----------------------------- | ------- | ------------------------ |
| `GET`   | `/charity/my-pickups`         | Charity | Get all assigned pickups |
| `PATCH` | `/charity/pickup-confirm/:id` | Charity | Confirm a pickup         |

---

## 💳 Charity Role Requests (Stripe)

| Method  | Endpoint                   | Access | Description                      |
| ------- | -------------------------- | ------ | -------------------------------- |
| `POST`  | `/charity-role-request`    | Auth   | Submit role request with payment |
| `GET`   | `/admin/role-requests`     | Admin  | View all role requests           |
| `PATCH` | `/admin/role-requests/:id` | Admin  | Approve or reject role request   |
| `POST`  | `/create-payment-intent`   | Auth   | Generate Stripe payment intent   |

---

## 🌟 Review Endpoints

| Method | Endpoint                  | Access  | Description                         |
| ------ | ------------------------- | ------- | ----------------------------------- |
| `POST` | `/reviews`                | Charity | Submit a review for a donation      |
| `GET`  | `/reviews?donationId=xxx` | Public  | Get reviews for a specific donation |
| `GET`  | `/reviews/mine`           | Charity | Get logged-in user's reviews        |
| `GET`  | `/reviews/community`      | Public  | Get latest community stories        |

---

## 📊 Dashboard Stats

| Method | Endpoint            | Access     | Description                             |
| ------ | ------------------- | ---------- | --------------------------------------- |
| `GET`  | `/admin/stats`      | Admin      | Get total stats (users, donations, etc) |
| `GET`  | `/restaurant/stats` | Restaurant | Restaurant-specific stats               |
| `GET`  | `/charity/stats`    | Charity    | Charity-specific stats                  |

---

## 🧪 Testing the API

You can test the endpoints using:

- 🧪 Postman  
- ⚛️ Frontend app integration

All secured routes require this header:  
`Authorization: Bearer <firebase_id_token>`

---

## 🙋 Contributing

Feel free to fork the project, open issues, or submit PRs. Contributions, suggestions, and feedback are always welcome!

---

## 🧑‍💻 Developer

**Ismail Hossain**  
📧 hm.ismail772@gmail.com  
🌍 Noakhali, Bangladesh  
🔗 [GitHub](https://github.com/ismail-dev-code) | [LinkedIn](https://www.linkedin.com/in/ismail-hossain24)
