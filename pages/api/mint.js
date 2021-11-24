const { MongoClient, ServerApiVersion } = require("mongodb");
const client = new MongoClient(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

export default async function mint(req, res) {
  await client.connect();
  const collection = client.db("db").collection("transactions");
  const currentTimestamp = +new Date();
  await collection.insertOne({
    ...req.body,
    createdAt: currentTimestamp,
    updatedAt: currentTimestamp,
    status: "pending",
  });
  await client.close();
  res.status(200).json({
    message: "Waiting for transaction confirmation",
    status: 200,
  });
}
