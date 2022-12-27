import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import {
  hashPassword,
  validateUserRegistration,
  makeUuid,
  validateUserLogin,
  login,
  getRefreshTokens,
  logout,
} from "~~/mulozi/misc/helpers";
import { verifyAccessToken } from "~~/mulozi/misc/helpers";
import {
  JSONResponse,
  JSONResponseStatus,
  Tokens,
  User,
} from "~~/mulozi/misc/types";
import { getClientPlatform } from "~~/mulozi/middleware";
import { H3Event, H3Error } from "h3";
import dayjs from "dayjs";

const prisma = new PrismaClient();

/**
 * @desc Registers (creates) a new user in database
 * @param event H3Event
 */
export async function registerUser(
  event: H3Event
): Promise<JSONResponse | H3Error> {
  const validationError = await validateUserRegistration(event);
  if (validationError) return validationError;

  const body = await readBody(event);

  // Attempt to hash password, if error, return error
  const hashedPasswordOrError = await hashPassword(body.password);
  if (hashedPasswordOrError instanceof H3Error) return hashedPasswordOrError;

  // If no password hash error, get password as string
  const hashedPassword = hashedPasswordOrError as string;

  const result = {} as JSONResponse;
  let user = {};

  let registrationError = null;
  await prisma.users
    .create({
      data: {
        first_name: body.first_name,
        last_name: body.last_name,
        uuid: makeUuid(),
        email: body.email,
        password: hashedPassword,
      },
    })
    .then(async (response) => {
      user = response;
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error(e);
      registrationError = e;
      await prisma.$disconnect();
    });

  if (registrationError)
    throw createError({
      statusCode: 500,
      statusMessage: "Server error",
    });

  // Create api result
  result.status = JSONResponseStatus.SUCCESS;
  if ("email" in user) {
    result.data = { email: user.email };
  }

  return result;
}

/**
 * @desc Authenticate user into database
 * @param event H3Event
 */
export async function loginUser(
  event: H3Event
): Promise<JSONResponse | H3Error> {
  const result = {} as JSONResponse;

  const validateError = await validateUserLogin(event);
  if (validateError instanceof H3Error) return validateError;

  const loginErrorOrTokens = await login(event);
  if (loginErrorOrTokens instanceof H3Error) return loginErrorOrTokens;

  const tokens = loginErrorOrTokens as Tokens;

  // Get client platform
  const errorOrPlatform = getClientPlatform(event);
  if (errorOrPlatform instanceof H3Error) return errorOrPlatform;

  // Get access token from header or cookie
  const platform = errorOrPlatform as string;

  // If platform is app dev/production, set tokens in header
  if (platform === "app") {
    setHeader(event, "access-token", "Bearer " + tokens.accessToken);
    setHeader(event, "refresh-token", "Bearer " + tokens.refreshToken);
  }

  // If platform is browser production, set tokens in secure, httpOnly cookies
  if (platform === "browser") {
    setCookie(event, "access-token", "Bearer " + tokens.accessToken, {
      httpOnly: true,
      secure: true,
    });

    // Cookies containing refresh tokens expire in 14 days, unless refreshed and new tokens obtained
    // Refresh tokens themselves expire in 14 days, unless new tokens are obtained
    setCookie(event, "refresh-token", "Bearer " + tokens.refreshToken, {
      httpOnly: true,
      secure: true,
      expires: dayjs().add(14, "day").toDate(),
    });
  }

  // Development cookies are not secure. Use only in development
  if (platform === "browser-dev") {
    setCookie(event, "access-token", "Bearer " + tokens.accessToken);
    setCookie(event, "refresh-token", "Bearer " + tokens.refreshToken);
  }

  // Create api result
  const body = await readBody(event);

  result.status = JSONResponseStatus.SUCCESS;
  result.data = {
    result: `user with email ${body.email} successfully logged in`,
  };

  return result;
}

/**
 * @desc Refresh user tokens
 * @param event H3Event
 */
export async function refreshTokens(
  event: H3Event
): Promise<JSONResponse | H3Error> {
  const result = {} as JSONResponse;

  const errorOrTokens = await getRefreshTokens(event);
  if (errorOrTokens instanceof H3Error) return errorOrTokens;

  const tokens = errorOrTokens as Tokens;

  const errorOrPlatform = getClientPlatform(event);
  if (errorOrPlatform instanceof H3Error) return errorOrPlatform;

  // Get access token from header or cookie
  const platform = errorOrPlatform as string;

  // If platform is app dev/production, set tokens in header
  if (platform === "app") {
    setHeader(event, "access-token", "Bearer " + tokens.accessToken);
    setHeader(event, "refresh-token", "Bearer " + tokens.refreshToken);
  }

  // If platform is browser production, set tokens in secure, httpOnly cookies
  if (platform === "browser") {
    setCookie(event, "access-token", "Bearer " + tokens.accessToken, {
      httpOnly: true,
      secure: true,
    });

    // Cookies containing refresh tokens expire in 14 days, unless refreshed and new tokens obtained
    // Refresh tokens themselves expire in 14 days, unless new tokens are obtained
    setCookie(event, "refresh-token", "Bearer " + tokens.refreshToken, {
      httpOnly: true,
      secure: true,
      expires: dayjs().add(14, "day").toDate(),
    });
  }

  // Development cookies are not secure. Use only in development
  if (platform === "browser-dev") {
    setCookie(event, "access-token", "Bearer " + tokens.accessToken);
    setCookie(event, "refresh-token", "Bearer " + tokens.refreshToken);
  }

  // Create api result
  result.status = JSONResponseStatus.SUCCESS;
  result.data = {
    result: `tokens refreshed successfully`,
  };

  return result;
}

/**
 * @desc Log user out
 * @param event H3Event
 */
export async function logoutUser(
  event: H3Event
): Promise<JSONResponse | H3Error> {
  const result = {} as JSONResponse;
  const error = await logout(event);
  if (error instanceof H3Error) return error;

  // Create api result
  result.status = JSONResponseStatus.SUCCESS;
  result.data = null;

  return result;
}

/**
 * @desc Checks if user is authenticated (checks if access token is still valid)
 * @param event
 * @returns {Promise<boolean | H3Error>} Returns true or false or error
 */
export async function isAuthenticated(
  event: H3Event
): Promise<boolean | H3Error> {
  // Check client platform
  let accessToken = null;

  // Get client platform
  const errorOrPlatform = getClientPlatform(event);
  if (errorOrPlatform instanceof H3Error) return errorOrPlatform;

  // If app, get token from header
  const platform = errorOrPlatform as string;
  if (platform === "app")
    // If browser, get token from cookies
    accessToken = event.node.req.headers["access-token"] as string;
  else if (["browser", "browser-dev"].includes(platform))
    accessToken = getCookie(event, "access-token") as string;

  // If no token, user is not authenticated
  if (!accessToken) {
    console.log("Error: No access token provided");
    return createError({
      statusCode: 400,
      statusMessage: "No access token provided",
    });
  }

  // Parse Bearer token (Bearer xxxx)
  const accessTokenArr = accessToken.split(" ");

  // Verify access token
  const errorOrUser = verifyAccessToken(accessTokenArr[1]);

  // If error is an expired access token, attempt to reauthenticate
  if (errorOrUser instanceof jwt.TokenExpiredError) {
    console.log("Yes, attempt to reauthenticate");
    const errorOrTokens = await getRefreshTokens(event);

    // If get an error, reauthentication failed
    if (errorOrTokens instanceof H3Error) {
      console.log("Reauthentication failed");
      return createError({
        statusCode: 500,
        statusMessage: "Reauthentication failed. Login required.",
      });
    }

    // Otherwise, get tokens
    const tokens = errorOrTokens as Tokens;

    const errorOrPlatform = getClientPlatform(event);
    if (errorOrPlatform instanceof H3Error) return errorOrPlatform;

    // Get access token from header or cookie
    const platform = errorOrPlatform as string;

    // If platform is app dev/production, set tokens in header
    if (platform === "app") {
      setHeader(event, "access-token", "Bearer " + tokens.accessToken);
      setHeader(event, "refresh-token", "Bearer " + tokens.refreshToken);
    }

    // If platform is browser production, set tokens in secure, httpOnly cookies
    if (platform === "browser") {
      setCookie(event, "access-token", "Bearer " + tokens.accessToken, {
        httpOnly: true,
        secure: true,
      });

      // Cookies containing refresh tokens expire in 14 days, unless refreshed and new tokens obtained
      // Refresh tokens themselves expire in 14 days, unless new tokens are obtained
      setCookie(event, "refresh-token", "Bearer " + tokens.refreshToken, {
        httpOnly: true,
        secure: true,
        expires: dayjs().add(14, "day").toDate(),
      });
    }

    // Development cookies are not secure. Use only in development
    if (platform === "browser-dev") {
      setCookie(event, "access-token", "Bearer " + tokens.accessToken);
      setCookie(event, "refresh-token", "Bearer " + tokens.refreshToken);
    }

    // Return authenticated
    console.log("Reauthentication successful");
    return true;
  }

  // If other error, return error
  if (errorOrUser instanceof H3Error) {
    console.log("Error: ", errorOrUser);
    return false;
  } else {
    // Otherwise, we have the user so return true
    return true;
  }
}
