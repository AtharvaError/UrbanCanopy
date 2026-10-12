import "dotenv/config";

const key = process.env.EXPLABS_API_KEY;
if (!key) {
  throw new Error("EXPLABS_API_KEY is missing from .env");
}

const response = await fetch(
  "https://api.experientiallabs.ai/v1/models",
  {
    headers: {
      Authorization: `Bearer ${key}`,
    },
  }
);

const data = await response.json();

if (!response.ok) {
  console.error("Request failed:", response.status, data);
  process.exit(1);
}

for (const model of data.data ?? []) {
  console.log(model.id);
}
