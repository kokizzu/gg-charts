import express from "express";
import {
  User,
  getUserById,
  getUserByEmail,
  createUser,
  setUserStripeCustomerId,
  setUserStripeSubscription,
} from "./db.js";
import { HttpError } from "./errors.js";
import { encryptString, decryptString } from "./encryption.js";
import {
  createCustomer,
  createSubscription,
  findCustomer,
  findSubscription,
} from "./stripe.js";

export async function authenticateUser(req: express.Request): Promise<User> {
  const cookie = req.signedCookies["auth"];

  if (!cookie) {
    throw new HttpError(401);
  }

  const userId = decryptString(cookie);

  if (!userId) {
    throw new HttpError(401);
  }

  const user = await getUserById(userId);

  if (!user) {
    throw new HttpError(401);
  }

  return user;
}

export function setAuthenticationCookie(
  userId: string,
  res: express.Response,
): void {
  res.cookie("auth", encryptString(userId), {
    maxAge: 24 * 60 * 60 * 1000, // 1 day.
    signed: true,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });
}

export function unsetAuthenticationCookie(res: express.Response): void {
  res.clearCookie("auth");
}

export async function onAuthenticationSuccessful(
  res: express.Response,
  email: string,
  originUrl?: string | null,
): Promise<void> {
  const user = (await getUserByEmail(email)) ?? (await createUser(email));

  // On successful authentication, Stripe resources are created, if necessary.
  // This operation is async.
  createStripeResources(user);

  setAuthenticationCookie(user.id, res);

  res.redirect(originUrl ?? "/");
}

async function createStripeResources(user: User): Promise<void> {
  try {
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer =
        (await findCustomer(user.email)) ?? (await createCustomer(user.email));

      setUserStripeCustomerId(user.id, customer.id);

      customerId = customer.id;
    }

    if (!user.stripeSubscriptionId) {
      const subscription =
        (await findSubscription(customerId)) ??
        (await createSubscription(customerId));

      setUserStripeSubscription(user.id, subscription.id, subscription.status);
    }
  } catch (error) {
    console.error(error);
  }
}
