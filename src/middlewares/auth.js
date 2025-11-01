import { OAuth2Client } from "google-auth-library";
const oauthClient = new OAuth2Client();

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).send("Authorization header missing");
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).send("Invalid or missing Bearer token");
  }

  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: process.env.CLIENT_ID,
    });
    req.user = ticket.getPayload(); // optional but useful for downstream routes
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    res.status(401).send("Unauthorized");
  }
};

export default verifyToken;
