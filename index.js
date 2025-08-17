const dotenv = require("dotenv");
const cors = require("cors");
const express = require("express");
dotenv.config();

const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

app.use(cors());
app.use(express.json());

const decodedKey = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);

const serviceAccount = JSON.parse(decodedKey);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.b4gl5td.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const bookingsCollection = client.db("sportsDB").collection("bookings");
    const announcementsCollection = client
      .db("sportsDB")
      .collection("announcements");
    const usersCollection = client.db("sportsDB").collection("users");
    const courtsCollection = client.db("sportsDB").collection("courts");
    const couponsCollection = client.db("sportsDB").collection("coupons");
    const paymentsCollection = client.db("sportsDB").collection("payments");

    //custom middleware
    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
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

    const verifyMember = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "member") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

   



    app.get("/users/search", async (req, res) => {
      const emailQuery = req.query.email;
      if (!emailQuery) {
        return res.status(400).send({ message: "Missing email query" });
      }

      const regex = new RegExp(emailQuery, "i"); // case-insensitive partial match

      try {
        const users = await usersCollection
          .find({ email: { $regex: regex } })
          .limit(10)
          .toArray();
        res.send(users);
      } catch (error) {
        console.error("Error searching users", error);
        res.status(500).send({ message: "Error searching users" });
      }
    });
    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res.status(200).json({ message: "User already exists" });
      }
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/role/:email",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const { role } = req.body;

        if (!["user", "admin"].includes(role)) {
          return res.status(400).json({ error: "Invalid role" });
        }

        const result = await usersCollection.updateOne(
          { email },
          { $set: { role } }
        );

        res.json(result);
      }
    );
    app.get("/users/:email/role", async (req, res) => {
      const { email } = req.params;

      try {
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json({ role: user.role || "user" }); // default to 'user' if no role
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch user role" });
      }
    });

    //member dashboard route
    app.get("/member/first-approved-booking", async (req, res) => {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const firstApproved = await bookingsCollection.findOne(
        {
          userEmail: email,
          status: "approved",
        },
        { sort: { createdAt: 1 }, projection: { createdAt: 1 } }
      );

      if (firstApproved) {
        res.json({ date: firstApproved.createdAt });
      } else {
        res.json({ date: null });
      }
    });

    app.get("/member/pending-bookings", async (req, res) => {
      const { email } = req.query;
      const bookings = await bookingsCollection
        .find({
          userEmail: email,
          status: "pending",
        })
        .toArray();
      console.log("bookings", bookings);
      res.json(bookings);
    });

    app.get("/member/approved-bookings", async (req, res) => {
      const { email } = req.query;
      const bookings = await bookingsCollection
        .find({ userEmail: email, status: "approved" })
        .toArray();
      res.json(bookings);
    });

    app.get(
      "/member/confirmed-bookings",
      verifyFBToken,
      verifyMember,
      async (req, res) => {
        const { email } = req.query;
        const confirmed = await bookingsCollection
          .find({ userEmail: email, status: "approved" })
          .toArray();
        res.json(confirmed);
      }
    );

    //payment part
    app.post("/coupon/verify", async (req, res) => {
      const { code } = req.body;
      const coupon = await couponsCollection.findOne({ code });

      if (coupon) {
        res.json({ valid: true, discount: coupon.discountAmount });
      } else {
        res.json({ valid: false });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount, // amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Payment intent error:", error);
        res.status(500).json({ error: "Failed to create payment intent" });
      }
    });

    app.post("/payments", async (req, res) => {
      const {
        bookingId,
        email,
        courtName,
        slots,
        date,
        originalPrice,
        finalPrice,
        transactionId,
        paymentMethod,
      } = req.body;

      try {
        // Save payment info
        const paymentResult = await paymentsCollection.insertOne({
          bookingId,
          email,
          courtName,
          slots,
          date,
          originalPrice,
          finalPrice,
          transactionId,
          paymentMethod,
          paidAt: new Date(),
        });
        console.log(req.body);

        // Optional: Update booking status to "paid"
        const bookingUpdate = await bookingsCollection.updateOne(
          { _id: new ObjectId(bookingId) },
          { $set: { status: "paid" } }
        );
        console.log("updated book", bookingUpdate);

        res.json(paymentResult);
      } catch (err) {
        console.error("Payment save error:", err);
        res.status(500).json({ error: "Failed to save payment" });
      }
    });

    app.get("/member/payments", verifyFBToken, async (req, res) => {
      const { email } = req.query;
      console.log("headers in payment", req.headers);
      const history = await paymentsCollection.find({ email }).toArray();
      res.json(history);
    });

    //member announcements
    app.get("/announcements/public", async (req, res) => {
      const announcements = await announcementsCollection
        .find()
        .sort({ date: -1 })
        .toArray();
      res.json(announcements);
    });

    app.get(
      "/member/bookings/status-count",
      verifyFBToken,
      verifyMember,
      async (req, res) => {
        try {
          const { email } = req.query;
          if (!email) return res.status(400).json({ error: "Email required" });

          const pipeline = [
            { $match: { userEmail: email } },
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
            {
              $project: {
                status: "$_id",
                count: 1,
                _id: 0,
              },
            },
          ];

          const result = await bookingsCollection.aggregate(pipeline).toArray();
          res.json(result);
        } catch (err) {
          console.error(err);
          res
            .status(500)
            .json({ error: "Failed to get member booking status counts" });
        }
      }
    );

    app.delete("/member/booking/:id", async (req, res) => {
      const { id } = req.params;
      const result = await bookingsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json({ success: result.deletedCount > 0 });
    });

    app.get("/admin/stats", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const totalMembers = await usersCollection.countDocuments({
          role: "member",
        }); // assuming 'member' role
        const totalCourts = await courtsCollection.countDocuments();

        res.json({
          totalUsers,
          totalMembers,
          totalCourts,
        });
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch admin stats" });
      }
    });
    app.get("/admin/bookings/pending", async (req, res) => {
      try {
        const bookings = await bookingsCollection
          .find({ status: "pending" })
          .toArray();
        res.json(bookings);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch pending bookings" });
      }
    });
    app.patch("/admin/bookings/approve/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }

        if (booking.status === "approved") {
          return res.status(400).json({ error: "Booking already approved" });
        }

        // Approve booking
        const updateBook = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "approved" } }
        );
        console.log("booking", updateBook);

        // Also update the user role to member
        const updateUsers = await usersCollection.updateOne(
          { email: booking.userEmail },
          { $set: { role: "member" } }
        );
        console.log("users", updateUsers);

        res.json({
          success: true,
          message: "Booking approved and user promoted",
        });
      } catch (err) {
        res.status(500).json({ error: "Internal server error" });
      }
    });

    //for manage members

    app.get("/admin/members", async (req, res) => {
      try {
        const search = req.query.search || "";

        // Aggregate approved bookings to get member emails
        const approvedBookings = await bookingsCollection
          .find({ status: "approved" })
          .project({ email: 1 })
          .toArray();
        console.log(approvedBookings);

        const query = {
          name: { $regex: search, $options: "i" }, // optional search by name
        };

        const members = await usersCollection.find(query).toArray();
        res.json(members);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch members" });
      }
    });

    app.delete("/admin/members/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const result = await usersCollection.deleteOne({ email });
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to delete member" });
      }
    });
    //for allUsers

    app.get("/admin/users", async (req, res) => {
      const search = req.query.search || "";
      const regex = new RegExp(search, "i"); // case-insensitive match

      try {
        const users = await usersCollection
          .find({
            $or: [
              { displayName: { $regex: regex } },
              { email: { $regex: regex } },
            ],
          })
          .toArray();

        res.json(users);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch users" });
      }
    });
    //for courts

    app.get("/courts",async (req, res) => {
      try {
        const courts = await courtsCollection.find().toArray();
        res.status(200).json(courts);
      } catch (err) {
        console.error("Failed to fetch courts:", err);
        res.status(500).json({ error: "Failed to fetch courts" });
      }
    });



    app.get("/admin/courts", async (req, res) => {
      try {
        const courts = await courtsCollection.find().toArray();
        res.json(courts);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch courts" });
      }
    });      
    app.post("/admin/courts", async (req, res) => {
      const { name, location, surface, image, slot, price, email } = req.body;
      if (!name || !location) {
        return res.status(400).json({ error: "Name and location required" });
      }

      const newCourt = {
        name,
        email,
        location,
        surface,
        image,
        slot,
        price,
        createdAt: new Date(),
      };

      try {
        const result = await courtsCollection.insertOne(newCourt);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to add court" });
      }
    });
    app.patch("/admin/courts/:id", async (req, res) => {
      const { id } = req.params;
      const update = req.body;

      try {
        const result = await courtsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: update }
        );
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to update court" });
      }
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      booking.status = "pending";
      booking.createdAt = new Date();
      const result = await bookingsCollection.insertOne(booking);
      res.json(result);
    })

    //manage bookings by only get

    app.get(
      "/admin/bookings/status-count",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const statusCounts = await bookingsCollection
            .aggregate([
              {
                $group: {
                  _id: "$status",
                  count: { $sum: 1 },
                },
              },
              {
                $project: {
                  status: "$_id",
                  count: 1,
                  _id: 0,
                },
              },
            ])
            .toArray();

          res.json(statusCounts);
        } catch (error) {
          console.error("Failed to get booking status counts", error);
          res.status(500).json({ error: "Internal Server Error" });
        }
      }
    );

    app.get("/admin/bookings/confirmed", async (req, res) => {
      const search = req.query.search || "";
      const query = { status: "approved" };

      if (search) {
        query.courtName = { $regex: new RegExp(search, "i") };
      }

      try {
        const bookings = await bookingsCollection.find(query).toArray();
        res.json(bookings);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch confirmed bookings" });
      }
    });

    //for coupons

    app.get("/admin/coupons", async (req, res) => {
      const coupons = await couponsCollection.find().toArray();
      res.json(coupons);
    });
    app.post("/admin/coupons", async (req, res) => {
      const { code, discount, expiresAt } = req.body;

      if (!code || !discount || !expiresAt) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const coupon = {
        code,
        discount: Number(discount),
        expiresAt: new Date(expiresAt),
      };

      const result = await couponsCollection.insertOne(coupon);
      res.json(result);
    });

    app.patch("/admin/coupons/:id", async (req, res) => {
      const { id } = req.params;
      const { code, discount, expiresAt } = req.body;

      const update = {
        code,
        discount: Number(discount),
        expiresAt: new Date(expiresAt),
      };

      const result = await couponsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: update }
      );

      res.json(result);
    });

    app.delete("/admin/coupons/:id", async (req, res) => {
      const { id } = req.params;
      const result = await couponsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    //manage announcements by admin
    app.get("/admin/announcements", async (req, res) => {
      try {
        const announcements = await announcementsCollection
          .find()
          .sort({ date: -1 })
          .toArray();
        res.json(announcements);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch announcements" });
      }
    });

    app.post("/admin/announcements", async (req, res) => {
      const { title, message } = req.body;
      if (!title || !message) {
        return res
          .status(400)
          .json({ error: "Title and message are required" });
      }

      const newAnnouncement = {
        title,
        message,
        date: new Date(),
      };

      const result = await announcementsCollection.insertOne(newAnnouncement);
      res.json(result);
    });

    app.patch("/admin/announcements/:id", async (req, res) => {
      const { id } = req.params;
      const { title, message } = req.body;

      const result = await announcementsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { title, message } }
      );

      res.json(result);
    });

    app.delete("/admin/announcements/:id", async (req, res) => {
      const { id } = req.params;
      const result = await announcementsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    app.delete("/admin/bookings/:id", async (req, res) => {
      const { id } = req.params;
      const result = await bookingsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.json(result);
    });

    app.get("/bookings", async (req, res) => {
      const { email, status } = req.query;

      // Check if both email and status are provided
      if (!email || !status) {
        return res
          .status(400)
          .json({ error: "Both email and status are required" });
      }

      try {
        const query = { userEmail: email, status };
        const bookings = await bookingsCollection.find(query).toArray();
        res.json(bookings);
      } catch (error) {
        console.error("Failed to fetch bookings:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.delete("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid booking ID" });
      }

      const result = await bookingsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.get("/announcements", async (req, res) => {
      try {
        const announcements = await announcementsCollection
          .find({})
          .sort({ date: -1 })
          .toArray();
        res.send(announcements);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch announcements" });
      }
    });

    app.post("/announcements", async (req, res) => {
      const { title, message } = req.body;

      if (!title || !message) {
        return res
          .status(400)
          .send({ error: "Title and message are required" });
      }

      const newAnnouncement = {
        title,
        message,
        date: new Date(),
      };

      try {
        const result = await announcementsCollection.insertOne(newAnnouncement);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to post announcement" });
      }
    });
    /**
     * DELETE /api/bookings/:id
     */

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Sports Club Server is running");
});

app.listen(port, () => {
  console.log(`Sports Server is running on ${port}`);
});
