// Copyright (c) 2026 CoverIt Labs. All Rights Reserved.
// Proprietary and confidential. Unauthorized use is strictly prohibited.
// See LICENSE file in the project root for full license information.

const express = require("express");
const path = require("path");
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/cart", (_, res) => res.sendFile(path.join(__dirname, "public/cart.html")));
app.get("/checkout", (_, res) => res.sendFile(path.join(__dirname, "public/checkout.html")));

app.post("/api/cart/add", (req, res) => {
  console.log("[API] /api/cart/add", req.body);
  res.json({ success: true, item: req.body });
});

app.listen(3001, () => console.log("Broken dummy site → http://localhost:3001"));
