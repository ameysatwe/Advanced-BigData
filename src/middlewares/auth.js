import { OAuth2Client } from "google-auth-library";
const oauthClient = new OAuth2Client();

const verifyToken = async (req, res, next) => {
  if (req.headers["authorization"] === undefined) {
    return res.status(400).send("authorization missing");
  } else if (req.headers["authorization"].split(" ")[0] !== "Bearer") {
    return res.status(400).send("Only Oauth2.0 is supported");
  }
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: req.headers["authorization"].split(" ")[1],
      audience: process.env.CLIENT_ID,
    });
    const payload = ticket.getPayload();
    next();
  } catch (err) {
    console.log(err);
    res.status(401).send("Unauthorized");
  }
};

export default verifyToken;
