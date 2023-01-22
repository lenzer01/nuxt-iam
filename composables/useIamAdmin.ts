import { JSONResponse, UsersTableEditable, NewUser } from "~~/iam/misc/types";

// Composable to make user management tasks easier
export default function useIamAdmin() {
  return {
    getUsers,
    createUser,
    updateUser,
    deleteUser,
  };
}

/**
 * @desc Get users
 * @returns {Promise<JSONResponse>}
 */
async function getUsers(): Promise<JSONResponse> {
  const clientPlatform = useRuntimeConfig().public.iamClientPlatform;

  const response = await $fetch("/api/iam/users", {
    headers: {
      "client-platform": clientPlatform,
    },
  });

  return response;
}

/**
 * @desc Create a user
 * @param newUser Minimum required values to create a new user
 * @returns {Promise<JSONResponse>}
 */
async function createUser(newUser: NewUser): Promise<JSONResponse> {
  const clientPlatform = useRuntimeConfig().public.iamClientPlatform;

  const response = await $fetch(`/api/iam/authn/register`, {
    method: "POST",
    headers: {
      "client-platform": clientPlatform,
    },
    body: newUser,
  });

  return response;
}

/**
 * @desc Update a user
 * @param uuid User's uuid
 * @param values User record's editable values
 * @returns {Promise<JSONResponse>}
 */
async function updateUser(
  uuid: string,
  values: UsersTableEditable
): Promise<JSONResponse> {
  const clientPlatform = useRuntimeConfig().public.iamClientPlatform;

  const response = await $fetch(`/api/iam/users/${uuid}`, {
    method: "PUT",
    headers: {
      "client-platform": clientPlatform,
    },
    body: values,
  });

  return response;
}

/**
 * @desc Delete a user
 * @returns {Promise<JSONResponse>}
 */
async function deleteUser(uuid: string): Promise<JSONResponse> {
  const clientPlatform = useRuntimeConfig().public.iamClientPlatform;

  const response = await $fetch(`/api/iam/users/${uuid}`, {
    method: "DELETE",
    headers: {
      "client-platform": clientPlatform,
    },
  });

  return response;
}
