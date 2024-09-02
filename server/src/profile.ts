import express from "express";
import { HttpError } from "./errors.js";
import {
  authenticateUser,
  isReadOnlyMode,
  setAuthenticationCookie,
  unsetAuthenticationCookie,
} from "./authentication.js";
import { cancelSubscription } from "./stripe.js";
import { deleteUser } from "./db.js";

const router = express.Router();

router.get("/", async function (req: express.Request, res: express.Response) {
  const user = await authenticateUser(req);

  setAuthenticationCookie(user.id, res);

  res.status(200).json({
    id: user.id,
    email: user.email,
    readOnly: isReadOnlyMode(user),
  });
});

router.post(
  "/close",
  async function (req: express.Request, res: express.Response) {
    const user = await authenticateUser(req);

    setAuthenticationCookie(user.id, res);

    if (
      typeof req.body !== "object" ||
      !req.body ||
      typeof req.body.confirm !== "string"
    ) {
      throw new HttpError(400);
    }

    const confirmation = req.body.confirm as string;

    if (confirmation !== user.email) {
      throw new HttpError(422);
    }

    // Cancel subscription.
    if (user.stripeSubscriptionId) {
      cancelSubscription(user.stripeSubscriptionId);
    }

    // Remove user data from database.
    await deleteUser(user.id);

    // Log out.
    unsetAuthenticationCookie(res);

    res.redirect("/");
  },
);

export default router;
