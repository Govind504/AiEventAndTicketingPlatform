const { app, connectDatabase } = require("../server");

module.exports = async (request, response) => {
  try {
    await connectDatabase();
    return app(request, response);
  } catch (error) {
    console.error("Vercel request could not connect to MongoDB:", error);
    return response.status(503).json({ error: "The service is temporarily unavailable" });
  }
};
