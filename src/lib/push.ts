import * as PushAPI from "@pushprotocol/restapi";

export const PUSH_ENV = "prod";

// Replace with your Push Protocol channel address when created
export const APP_CHANNEL_ADDRESS =
  "0x0000000000000000000000000000000000000000" as `0x${string}`;

export async function pushSubscribe(user: `0x${string}`) {
  return PushAPI.user.getSubscriptions({
    user: `eip155:137:${user}`,
    env: PUSH_ENV as any,
  });
}

export async function getUserNotifications(user: `0x${string}`) {
  return PushAPI.user.getFeeds({
    user: `eip155:137:${user}`,
    env: PUSH_ENV as any,
    spam: false,
  });
}
