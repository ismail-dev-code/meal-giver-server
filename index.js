const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
// config
dotenv.config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
// MongoDB setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pw0rah1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const { ServerApiVersion } = require("mongodb");
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("mealgiver");
    const usersCollection = db.collection("users");
    const reviewsCollection = db.collection("reviews");
    const transactionsCollection = db.collection("transactions");
    const donationsCollection = db.collection("donations");
    const favoritesCollection = db.collection("favorites");
    const roleRequestsCollection = db.collection("roleRequests");
    const donationRequestsCollection = db.collection("donationRequests");
    // custom middlewares
    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      // verify the token
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        console.log(error);
        return res.status(403).send({ message: "forbidden access" });
      }
    };
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyRestaurant = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      console.log(user);
      if (!user || user.role !== "restaurant") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyCharity = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      console.log(user);
      if (!user || user.role !== "charity") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    // Create PaymentIntent
    // POST /create-payment-intent
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // POST /transactions
    app.post("/transactions", async (req, res) => {
      const result = await transactionsCollection.insertOne(req.body);
      res.send(result);
    });

    app.get("/charity-role-transactions", async (req, res) => {
      const email = req.query.email;
      try {
        const requests = await roleRequestsCollection
          .find({ email })
          .sort({ date: -1 })
          .toArray();

        const response = requests.map((doc) => ({
          name: doc.name,
          email: doc.email,
          organization: doc.organization,
          mission: doc.mission,
          transactionId: doc.transactionId,
          amount: doc.amount,
          date: doc.date,
          status: doc.status || "Pending",
        }));

        res.send(response);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to load transactions" });
      }
    });

    app.post("/charity-role-request", async (req, res) => {
      const { email } = req.body;

      try {
        const existing = await roleRequestsCollection.findOne({
          email,
          status: { $in: ["pending", "approved"] },
        });

        if (existing) {
          return res.status(400).send({
            message: `A charity role request is already ${existing.status.toLowerCase()}.`,
          });
        }

        await roleRequestsCollection.insertOne(req.body);
        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Request failed." });
      }
    });
    //  GET all charity role requests (for Admin panel)
    app.get("/charity-role-request", async (req, res) => {
      try {
        const requests = await roleRequestsCollection
          .find()
          .sort({ date: -1 })
          .toArray();
        res.send(requests);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch role requests." });
      }
    });

    // GET /role-request-status?email=user@example.com
    app.get("/role-request-status", async (req, res) => {
      const email = req.query.email;
      const existing = await roleRequestsCollection.findOne({ email });
      res.send({ status: existing?.status });
    });

    app.get("/donations/featured", async (req, res) => {
      try {
        const featuredDonations = await donationsCollection
          .find({ featured: true })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(featuredDonations);
      } catch (error) {
        console.error("Error fetching featured donations:", error);
        res.status(500).send({ message: "Failed to fetch featured donations" });
      }
    });
    const verifyAdminOrRestaurant = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email });

      if (!user || (user.role !== "admin" && user.role !== "restaurant")) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      next();
    };

    app.patch(
      "/donations/:id",
      verifyFBToken,
      verifyAdminOrRestaurant,
      async (req, res) => {
        const { id } = req.params;
        const updateData = req.body;

        try {
          const donation = await donationsCollection.findOne({
            _id: new ObjectId(id),
          });
          if (!donation) {
            return res.status(404).send({ message: "Donation not found" });
          }

          const result = await donationsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { ...updateData, updatedAt: new Date().toISOString() } }
          );

          res.send({ modifiedCount: result.modifiedCount });
        } catch (error) {
          console.error("Error updating donation:", error);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );

    // Get all charity requests with donation info
    app.get(
      "/charity-requests",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const requests = await db
            .collection("requests")
            .aggregate([
              {
                $lookup: {
                  from: "donations",
                  localField: "donationId",
                  foreignField: "_id",
                  as: "donation",
                },
              },
              { $unwind: "$donation" },
              {
                $project: {
                  charityName: 1,
                  charityEmail: 1,
                  description: 1,
                  donation: { title: 1 },
                },
              },
            ])
            .toArray();

          res.send(requests);
        } catch (error) {
          console.error("Error fetching charity requests:", error);
          res.status(500).send({ message: "Failed to fetch charity requests" });
        }
      }
    );

    app.get(
      "/donations/charity/request-status",
      verifyFBToken,
      verifyCharity,
      async (req, res) => {
        const email = req.decoded.email;

        try {
          const statusCounts = await db
            .collection("requests")
            .aggregate([
              { $match: { charityEmail: email } },
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                },
              },
            ])
            .toArray();

          const formatted = statusCounts.map((item) => ({
            status: item._id,
            count: item.count,
          }));

          res.send(formatted);
        } catch (error) {
          console.error("Error fetching charity request status:", error);
          res
            .status(500)
            .send({ message: "Failed to get request status breakdown" });
        }
      }
    );
    app.get("/restaurant/donation-types-stats", async (req, res) => {
      const email = req.query.email;
      const types = await donationsCollection
        .aggregate([
          { $match: { "restaurant.email": email } },
          {
            $group: {
              _id: "$type",
              quantity: { $sum: "$quantity" },
            },
          },
          {
            $project: {
              _id: 0,
              type: "$_id",
              quantity: 1,
            },
          },
        ])
        .toArray();

      res.send(types);
    });

    // GET all donation requests made by charity
    app.get(
      "/requests/charity",
      verifyFBToken,
      verifyCharity,
      async (req, res) => {
        const email = req.decoded.email;

        try {
          const requests = await db
            .collection("requests")
            .aggregate([
              { $match: { charityEmail: email } },
              {
                $lookup: {
                  from: "donations",
                  localField: "donationId",
                  foreignField: "_id",
                  as: "donationDetails",
                },
              },
              { $unwind: "$donationDetails" },
              {
                $project: {
                  _id: 1,
                  status: 1,
                  pickupTime: 1,
                  description: 1,
                  donation: "$donationDetails",
                },
              },
            ])
            .toArray();

          res.send(requests);
        } catch (err) {
          console.error("Error fetching charity requests:", err);
          res.status(500).send({ message: "Failed to load requests" });
        }
      }
    );

    // DELETE request by ID (only if status is "pending")
    // app.delete(
    //   "/requests/:id",
    //   verifyFBToken,
    //   verifyCharity,
    //   async (req, res) => {
    //     const { id } = req.params;

    //     try {
    //       const request = await db
    //         .collection("requests")
    //         .findOne({ _id: new ObjectId(id) });

    //       if (!request || request.status !== "pending") {
    //         return res
    //           .status(403)
    //           .send({ message: "Only pending requests can be canceled." });
    //       }

    //       const result = await db
    //         .collection("requests")
    //         .deleteOne({ _id: new ObjectId(id) });
    //       res.send(result);
    //     } catch (err) {
    //       console.error("Error deleting request:", err);
    //       res.status(500).send({ message: "Failed to cancel request" });
    //     }
    //   }
    // );

    app.delete(
      "/requests/:id",
      verifyFBToken,
      verifyCharity,
      async (req, res) => {
        const { id } = req.params;

        try {
          // Ensure request exists and belongs to the current user and is still pending
          const existing = await db
            .collection("requests")
            .findOne({ _id: new ObjectId(id) });

          if (!existing) {
            return res.status(404).send({ message: "Request not found." });
          }

          if (existing.status !== "pending") {
            return res
              .status(403)
              .send({ message: "Only pending requests can be cancelled." });
          }

          const result = await db
            .collection("requests")
            .deleteOne({ _id: new ObjectId(id) });

          if (result.deletedCount > 0) {
            res.send({ message: "Request cancelled successfully." });
          } else {
            res.status(500).send({ message: "Failed to cancel request." });
          }
        } catch (error) {
          console.error(" Cancel request error:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );

    // Delete a charity request by ID
    app.delete(
      "/charity-requests/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;

        try {
          const result = await db
            .collection("requests")
            .deleteOne({ _id: new ObjectId(id) });
          if (result.deletedCount === 0) {
            return res.status(404).send({ message: "Request not found" });
          }
          res.send({ message: "Request deleted successfully" });
        } catch (error) {
          console.error("Error deleting charity request:", error);
          res.status(500).send({ message: "Failed to delete request" });
        }
      }
    );

    // Get all charity role requests
    app.get(
      "/role-requests/charity",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const requests = await roleRequestsCollection
            .find({ role: "charity" })
            .toArray();
          res.send(requests);
        } catch (error) {
          console.error("Error fetching charity role requests:", error);
          res.status(500).send({ message: "Failed to fetch role requests" });
        }
      }
    );

    // Update status of role request
    app.patch(
      "/role-requests/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;

        if (!["pending", "approved", "rejected"].includes(status)) {
          return res.status(400).send({ message: "Invalid status" });
        }

        try {
          const result = await roleRequestsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } }
          );
          res.send(result);
        } catch (error) {
          console.error("Error updating role request status:", error);
          res.status(500).send({ message: "Failed to update status" });
        }
      }
    );

    // Update user role by email
    app.patch(
      "/users/:email/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { email } = req.params;
        const { role } = req.body;

        if (!["admin", "restaurant", "charity", "user"].includes(role)) {
          return res.status(400).send({ message: "Invalid role" });
        }

        try {
          const result = await usersCollection.updateOne(
            { email },
            { $set: { role } }
          );
          res.send({ modifiedCount: result.modifiedCount });
        } catch (error) {
          console.error("Error updating user role:", error);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );

    // Get all users
    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Update user role
    app.patch(
      "/users/:id/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const { role } = req.body;

        try {
          const result = await usersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { role } }
          );

          res.send({ modifiedCount: result.modifiedCount });
        } catch (error) {
          console.error("Error updating role:", error);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );

    // Delete user
    app.delete("/users/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;

      try {
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send({ message: "Failed to delete user" });
      }
    });

    app.get("/donations/status-count", verifyFBToken, async (req, res) => {
      try {
        const counts = await donationsCollection
          .aggregate([
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray();

        // Convert to array with { status, count } structure
        const result = counts.map((item) => ({
          status: item._id,
          count: item.count,
        }));

        res.send(result);
      } catch (error) {
        console.error("Error fetching donation status count:", error);
        res.status(500).send({ message: "Failed to fetch status counts" });
      }
    });
    // GET /users/:email
    app.get("/users/:email", verifyFBToken, async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      res.send(user);
    });
    // GET /charity/latest-requests
    app.get("/charity/latest-requests", async (req, res) => {
      try {
        const latestRequests = await db
          .collection("donationRequests")
          .find({})
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();
        res.send(latestRequests);
      } catch (error) {
        console.error("Error fetching charity requests:", error);
        res.status(500).send({ message: "Failed to load charity requests" });
      }
    });

    // 1. Get all approved donations
    app.get("/donations", async (req, res) => {
      const approved = req.query.approved === "true";
      const filter = approved ? { approved: true } : {};
      const donations = await donationsCollection.find(filter).toArray();
      res.send(donations);
    });
    // Add a new donation (for restaurant users)
    app.post("/donations", async (req, res) => {
      const donation = req.body;
      if (
        !donation.title ||
        !donation.type ||
        !donation.quantity ||
        !donation.pickupWindow ||
        !donation.restaurant?.name ||
        !donation.restaurant?.email ||
        !donation.restaurant?.location ||
        !donation.image
      ) {
        return res.status(400).send({ message: "Missing required fields" });
      }

      donation.status = "available";
      donation.approved = false;
      donation.createdAt = new Date().toISOString();

      try {
        const result = await donationsCollection.insertOne(donation);
        res.send({ insertedId: result.insertedId });
      } catch (error) {
        console.error("Error adding donation:", error);
        res.status(500).send({ message: "Failed to add donation" });
      }
    });

    // Get all donations of the logged-in restaurant
    app.get(
      "/my-donations",
      verifyFBToken,
      verifyRestaurant,
      async (req, res) => {
        const email = req.decoded.email;
        const donations = await donationsCollection
          .find({ "restaurant.email": email })
          .toArray();
        res.send(donations);
      }
    );
    app.post("/reviews", verifyFBToken, async (req, res) => {
      const review = req.body;

      try {
        const result = await reviewsCollection.insertOne(review);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error saving review:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/reviews", verifyFBToken, async (req, res) => {
      const { donationId } = req.query;
      if (!donationId) {
        return res.status(400).send({ message: "donationId is required" });
      }

      try {
        const reviews = await db
          .collection("reviews")
          .find({ donationId: donationId })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(reviews);
      } catch (err) {
        console.error("Error fetching reviews:", err);
        res.status(500).send({ message: "Failed to fetch reviews" });
      }
    });
    app.get("/reviews/user/:email", verifyFBToken, async (req, res) => {
      const { email } = req.params;
      try {
        const reviews = await db
          .collection("reviews")
          .find({ userEmail: email })
          .toArray();
        res.send(reviews);
      } catch (error) {
        console.error("Error fetching user reviews:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    app.delete("/reviews/:id", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      try {
        const result = await db
          .collection("reviews")
          .deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
          res.send({ success: true, message: "Review deleted" });
        } else {
          res.status(404).send({ success: false, message: "Review not found" });
        }
      } catch (error) {
        console.error("Error deleting review:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Get a single donation by ID
    app.get(
      "/donations/:id",
      verifyFBToken,
      // verifyRestaurant,
      async (req, res) => {
        const { id } = req.params;

        try {
          const donation = await donationsCollection.findOne({
            _id: new ObjectId(id),
          });

          if (!donation) {
            return res.status(404).send({ message: "Donation not found" });
          }

          res.send(donation);
        } catch (error) {
          console.error("Error fetching donation:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );
    app.get("/favorites/:email", verifyFBToken, async (req, res) => {
      const { email } = req.params;
      try {
        const favorites = await favoritesCollection.find({ email }).toArray();
        res.send(favorites);
      } catch (error) {
        console.error("Error fetching favorites:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    app.post("/favorites", verifyFBToken, async (req, res) => {
      try {
        const { email, donationId } = req.body;

        if (!email || !donationId) {
          return res
            .status(400)
            .send({ message: "Missing email or donationId" });
        }

        // Check if already favorited
        const exists = await favoritesCollection.findOne({ email, donationId });
        if (exists) {
          return res.status(409).send({ message: "Already favorited" });
        }

        // Save to favorites
        const result = await favoritesCollection.insertOne({
          email,
          donationId,
          favoritedAt: new Date(),
        });
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error saving favorite:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Update donation by ID (only if not rejected)
    app.patch(
      "/donations/:id",
      verifyFBToken,
      verifyRestaurant,
      async (req, res) => {
        const { id } = req.params;
        const updateData = req.body;

        const donation = await donationsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!donation || donation.status === "rejected") {
          return res
            .status(403)
            .send({ message: "Cannot update rejected donation." });
        }

        const result = await donationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              ...updateData,
              updatedAt: new Date().toISOString(),
            },
          }
        );
        res.send(result);
      }
    );

    app.get("/charity/latest-requests/recent", async (req, res) => {
      try {
        const requests = await db
          .collection("roleRequests")
          .find({ status: "approved" }) // Only show approved charity role requests
          .sort({ date: -1 })
          .limit(6)
          .toArray();

        const enrichedRequests = await Promise.all(
          requests.map(async (req) => {
            const user = await db
              .collection("users")
              .findOne({ email: req.email });

            return {
              _id: req._id,
              charityName: user?.name || "Unknown Charity",
              charityLogo: user?.photo || null,
              description: req.mission || "No mission statement available",
              donationTitle: req.organization || "No Organization Name",
            };
          })
        );

        res.send(enrichedRequests);
      } catch (error) {
        console.error("Error fetching charity requests:", error);
        res.status(500).send({ message: "Failed to load charity requests" });
      }
    });

    // Delete donation by ID
    app.delete(
      "/donations/:id",
      verifyFBToken,
      verifyRestaurant,
      async (req, res) => {
        const { id } = req.params;

        const result = await donationsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );
    app.get(
      "/charity/email/:email",
      verifyFBToken,
      verifyCharity,
      async (req, res) => {
        const { email } = req.params;

        try {
          const user = await usersCollection.findOne({ email });

          if (!user || user.role !== "charity") {
            return res.status(404).send({ message: "Charity not found" });
          }

          res.send(user);
        } catch (err) {
          console.error("Error fetching charity profile:", err);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );

    app.get("/reviews/community", async (req, res) => {
      try {
        const reviews = await db
          .collection("reviews")
          .find({})
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        const enriched = await Promise.all(
          reviews.map(async (review) => {
            const user = await db
              .collection("users")
              .findOne({ email: review.userEmail });
            return {
              _id: review._id,
              name: review.reviewer || user?.name || "Anonymous",
              role:
                user?.role === "restaurant"
                  ? "Restaurant Partner"
                  : "Charity Partner",
              image: user?.photo || "/default-logo.png",
              quote: review.comment,
            };
          })
        );

        res.send(enriched);
      } catch (err) {
        console.error("Failed to load community stories", err);
        res.status(500).send({ message: "Failed to load community stories" });
      }
    });

    app.get(
      "/admin/email/:email",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const { email } = req.params;

        try {
          const user = await usersCollection.findOne({ email });

          if (!user || user.role !== "admin") {
            return res.status(404).send({ message: "Admin not found" });
          }

          res.send({
            email: user.email,
            name: user.name,
            role: user.role,
            photo: user.photo || null,
            last_log_in: user.last_log_in,
            created_at: user.created_at,
          });
        } catch (err) {
          console.error("Error fetching admin profile:", err);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );

    // Get restaurant profile by email (used in RestaurantProfile component)
    app.get(
      "/users/email/:email",
      verifyFBToken,
      verifyRestaurant,
      async (req, res) => {
        const { email } = req.params;

        try {
          const user = await usersCollection.findOne({ email });

          if (!user || user.role !== "restaurant") {
            return res.status(404).send({ message: "Restaurant not found" });
          }

          res.send(user);
        } catch (err) {
          console.error("Error fetching restaurant profile:", err);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );
    app.post(
      "/donation-requests",
      verifyFBToken,
      verifyCharity,
      async (req, res) => {
        const data = req.body;
        if (
          !data.donationId ||
          !data.restaurantId ||
          !data.restaurantName ||
          !data.restaurantEmail ||
          !data.charityEmail ||
          !data.charityName ||
          !data.donationTitle ||
          !data.requestDescription ||
          !data.pickupTime
        ) {
          return res.status(400).send({ message: "Missing required fields." });
        }

        try {
          // Check if the same charity has already requested this donation
          const existingRequest = await db.collection("requests").findOne({
            donationId: new ObjectId(data.donationId),
            charityEmail: data.charityEmail,
          });

          if (existingRequest) {
            return res
              .status(409)
              .send({ message: "You already requested this donation." });
          }

          const newRequest = {
            ...data,
            donationId: new ObjectId(data.donationId),
            restaurantId: new ObjectId(data.restaurantId),
            status: "pending",
            createdAt: new Date().toISOString(),
          };

          const result = await db.collection("requests").insertOne(newRequest);
          res.send({ insertedId: result.insertedId });
        } catch (error) {
          console.error("Failed to submit donation request:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );

    app.post(
      "/donations/:id/requests",
      verifyFBToken,
      verifyCharity,
      async (req, res) => {
        const { id } = req.params;
        const data = req.body;

        console.log("🛬 Received Request Body:", data);

        // Check for missing fields
        const requiredFields = [
          "donationId",
          "donationTitle",
          "restaurantName",
          "restaurantEmail",
          "charityEmail",
          "charityName",
          "requestDescription",
          "pickupTime",
        ];

        const missing = requiredFields.filter((field) => !data[field]);

        if (missing.length > 0) {
          return res.status(400).send({
            message: `Missing required fields: ${missing.join(", ")}`,
          });
        }

        try {
          const existingRequest = await db.collection("requests").findOne({
            donationId: new ObjectId(id),
            charityEmail: data.charityEmail,
          });

          if (existingRequest) {
            return res
              .status(409)
              .send({ message: "You already requested this donation." });
          }

          const newRequest = {
            ...data,
            donationId: new ObjectId(id),
            restaurantId: new ObjectId(data.restaurantId),
            status: "pending",
            createdAt: new Date().toISOString(),
          };

          const result = await db.collection("requests").insertOne(newRequest);
          res.send({ insertedId: result.insertedId });
        } catch (error) {
          console.error("Failed to submit donation request:", error);
          res.status(500).send({ message: "Internal Server Error" });
        }
      }
    );
    app.delete("/favorites/:id", verifyFBToken, async (req, res) => {
      const { id } = req.params;

      try {
        const result = await favoritesCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 1) {
          res.send({ success: true, message: "Favorite removed" });
        } else {
          res
            .status(404)
            .send({ success: false, message: "Favorite not found" });
        }
      } catch (error) {
        console.error("Error removing favorite:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    app.get(
      "/requests/restaurant",
      verifyFBToken,
      verifyRestaurant,
      async (req, res) => {
        const email = req.decoded.email;

        const donations = await donationsCollection
          .find({ "restaurant.email": email })
          .toArray();
        const donationIds = donations.map((don) => don._id);

        const requests = await db
          .collection("requests")
          .aggregate([
            { $match: { donationId: { $in: donationIds } } },
            {
              $lookup: {
                from: "donations",
                localField: "donationId",
                foreignField: "_id",
                as: "donationDetails",
              },
            },
            { $unwind: "$donationDetails" },
            {
              $project: {
                _id: 1,
                donationId: 1,
                charityName: 1,
                charityEmail: 1,
                description: 1,
                pickupTime: 1,
                status: 1,
                donation: "$donationDetails",
              },
            },
          ])
          .toArray();

        res.send(requests);
      }
    );
    app.patch(
      "/requests/:id",
      verifyFBToken,
      verifyRestaurant,
      async (req, res) => {
        const { id } = req.params;
        const { action, donationId } = req.body;

        if (!["accept", "reject"].includes(action)) {
          return res.status(400).send({ message: "Invalid action" });
        }

        try {
          // Update selected request
          const result = await db.collection("requests").updateOne(
            { _id: new ObjectId(id) },
            {
              $set: { status: action === "accept" ? "accepted" : "rejected" },
            }
          );

          // If accepted, reject all other requests for same donation
          if (action === "accept") {
            await db.collection("requests").updateMany(
              {
                donationId: new ObjectId(donationId),
                _id: { $ne: new ObjectId(id) },
              },
              { $set: { status: "rejected" } }
            );
          }

          res.send({ modified: result.modifiedCount });
        } catch (err) {
          console.error("Error updating request:", err);
          res.status(500).send({ message: "Internal server error" });
        }
      }
    );
    // 1. Get charity pickups (accepted only)
    app.get(
      "/charity/my-pickups",
      verifyFBToken,
      verifyCharity,
      async (req, res) => {
        const email = req.decoded.email;
        const requests = await db
          .collection("requests")
          .aggregate([
            { $match: { charityEmail: email, status: "accepted" } },
            {
              $lookup: {
                from: "donations",
                localField: "donationId",
                foreignField: "_id",
                as: "donationDetails",
              },
            },
            { $unwind: "$donationDetails" },
            {
              $project: {
                _id: 1,
                donationTitle: "$donationDetails.title",
                foodType: "$donationDetails.type",
                quantity: "$donationDetails.quantity",
                pickupTime: 1,
                status: 1,
                restaurantName: "$donationDetails.restaurant.name",
                location: "$donationDetails.restaurant.location",
              },
            },
          ])
          .toArray();

        res.send(requests);
      }
    );

    // 2. Confirm pickup
    app.patch(
      "/charity/pickup-confirm/:id",
      verifyFBToken,
      verifyCharity,
      async (req, res) => {
        const { id } = req.params;
        try {
          const result = await db.collection("requests").updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status: "picked_up",
                pickupDate: new Date().toISOString(),
              },
            }
          );
          res.send(result);
        } catch (err) {
          res.status(500).send({ message: "Pickup confirmation failed" });
        }
      }
    );
    app.post("/charity/submit-review", verifyFBToken, async (req, res) => {
      try {
        const { donationId, reviewer, comment, rating } = req.body;

        // Validate inputs
        if (
          !donationId ||
          !reviewer ||
          !comment ||
          typeof rating !== "number"
        ) {
          return res
            .status(400)
            .send({ message: "Missing or invalid review data" });
        }

        const review = {
          donationId,
          reviewer,
          comment,
          rating,
          createdAt: new Date(),
        };

        const result = await reviewsCollection.insertOne(review);

        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error submitting review:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // 3. Get received donations
    app.get(
      "/charity/received-donations",
      verifyFBToken,
      verifyCharity,
      async (req, res) => {
        const email = req.decoded.email;
        const result = await db
          .collection("requests")
          .aggregate([
            { $match: { charityEmail: email, status: "picked_up" } },
            {
              $lookup: {
                from: "donations",
                localField: "donationId",
                foreignField: "_id",
                as: "donationDetails",
              },
            },
            { $unwind: "$donationDetails" },
            {
              $project: {
                _id: 1,
                donationId: "$donationId",

                donationTitle: "$donationDetails.title",
                foodType: "$donationDetails.type",
                quantity: "$donationDetails.quantity",
                pickupDate: "$pickupDate",
                restaurantName: "$donationDetails.restaurant.name",
              },
            },
            {
              $sort: { pickupDate: -1 },
            },
          ])
          .toArray();
        res.send(result);
      }
    );

    //  Get all donations requested from this restaurant
    app.get(
      "/restaurant/requested-donations",
      verifyFBToken,
      verifyRestaurant,
      async (req, res) => {
        const email = req.decoded.email;

        try {
          const requestedDonations = await donationsCollection
            .find({ "restaurant.email": email, status: "requested" })
            .toArray();

          res.send(requestedDonations);
        } catch (error) {
          console.error("Error fetching requested donations:", error);
          res
            .status(500)
            .send({ message: "Failed to load requested donations" });
        }
      }
    );

    // Get statistics (e.g., total donations, approved, requested, available)
    app.get(
      "/restaurant/stats",
      verifyFBToken,
      verifyRestaurant,
      async (req, res) => {
        const email = req.decoded.email;

        try {
          const total = await donationsCollection.countDocuments({
            "restaurant.email": email,
          });
          const approved = await donationsCollection.countDocuments({
            "restaurant.email": email,
            approved: true,
          });
          const available = await donationsCollection.countDocuments({
            "restaurant.email": email,
            status: "available",
          });
          const requested = await donationsCollection.countDocuments({
            "restaurant.email": email,
            status: "requested",
          });

          res.send({ total, approved, available, requested });
        } catch (error) {
          console.error("Error fetching restaurant stats:", error);
          res.status(500).send({ message: "Failed to load statistics" });
        }
      }
    );

    // user related API
    app.post("/users", async (req, res) => {
      const email = req.body.email;

      const userExists = await usersCollection.findOne({ email });

      if (userExists) {
        //  Update last log in
        await usersCollection.updateOne(
          { email },
          { $set: { last_log_in: new Date().toISOString() } }
        );

        return res.status(200).send({
          message: "User already exists. last_log_in updated.",
          inserted: false,
        });
      }

      const user = {
        ...req.body,
        created_at: new Date().toISOString(),
        last_log_in: new Date().toISOString(),
      };

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    // users can update their profile
    app.patch("/users/update-profile", async (req, res) => {
      const { email, newName, newEmail, newPhoto } = req.body;

      if (!email) {
        return res.status(400).send({ message: "Current email is required" });
      }

      const updateDoc = {
        last_log_in: new Date().toISOString(),
      };

      if (newName) updateDoc.name = newName;
      if (newEmail) updateDoc.email = newEmail;
      if (newPhoto) updateDoc.photo = newPhoto;

      try {
        const result = await usersCollection.updateOne(
          { email },
          { $set: updateDoc }
        );

        res.send({
          message: "Profile and last_log_in updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (err) {
        res.status(500).send({ message: "Failed to update user", error: err });
      }
    });
    // Get user profile by email

    app.get("/users/profile", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).send({ message: "Email is required" });

      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });

      // Send only needed info
      res.send({
        email: user.email,
        name: user.name,
        role: user.role,
        last_log_in: user.last_log_in,
      });
    });

    // Get role of a user by email
    app.get("/users/:email/role", async (req, res) => {
      const { email } = req.params;

      try {
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "user" });
      } catch (error) {
        console.error("Error getting user role:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("mealgiver Server is running...");
});

app.listen(port, () => {
  console.log(`mealgiver server running on port ${port}`);
});
