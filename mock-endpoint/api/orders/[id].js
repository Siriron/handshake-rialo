// Demo order-status endpoint for the escrow's REX check (deploy on Vercel).
// GET /api/orders/<id> -> {"status": "pending|shipped|delivered|cancelled"}
// Demo rule only: ids starting "delivered-" report delivered, "cancelled-"
// report cancelled, everything else is pending. Replace with a real source.
module.exports = (req, res) => {
  const id = String(req.query.id || "");
  let status = "pending";
  if (id.startsWith("delivered-")) status = "delivered";
  else if (id.startsWith("cancelled-")) status = "cancelled";
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(JSON.stringify({ status }));
};
