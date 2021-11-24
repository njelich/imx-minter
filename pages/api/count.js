import { uri } from "../../webConfig";

const { MongoClient, ServerApiVersion } = require("mongodb");
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

export default async function count(req, res) {
  await client.connect();
  const collection = client.db("db").collection("transactions");
  const filter = { $or: [{ status: "pending" }, { status: "success" }] };
  const transactions = await collection.find(filter).toArray();
  let counter = 0;
  console.log(transactions);
  transactions.forEach((x) => {
    x.amount ? (counter += Number(x.amount)) : null;
  });
  await client.close();
  res.status(200).send(counter);
}
