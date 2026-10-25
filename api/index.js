const app = require("../server");

module.exports = async (request, response) => {
  if (request.url.startsWith("/api/") && !request.url.startsWith("/api/health")) {
    try {
      await app.connectDatabase();
    } catch (error) {
      console.error("Vercel request could not connect to MongoDB:", error);
      return response.status(503).json({ error: "The service is temporarily unavailable" });
    }
  }
  return app(request, response);
};
