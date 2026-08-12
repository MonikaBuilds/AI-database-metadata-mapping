const API_BASE_URL = "http://127.0.0.1:8000/api/v1";


async function parseResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail ||
      data.message ||
      "Something went wrong while communicating with the backend."
    );
  }

  return data;
}


export async function testDatabaseConnection(payload) {
  const response = await fetch(
    `${API_BASE_URL}/databases/test-connection`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  return parseResponse(response);
}


export async function giveMetadataConsent(databaseName) {
  const response = await fetch(
    `${API_BASE_URL}/databases/consent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        database_name: databaseName,
        authorized: true,
      }),
    }
  );

  return parseResponse(response);
}


export async function fetchDatabaseSchema(payload) {
  const response = await fetch(
    `${API_BASE_URL}/databases/fetch-schema`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  return parseResponse(response);
}