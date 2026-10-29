import { createContext, useContext } from "react";

/**
 * What public pages need from the app without importing Firebase: the prerender
 * renders them on the server, where there is no auth and no `window`.
 */
export interface PublicActions {
  signedIn: boolean;
  signingIn: boolean;
  signIn: () => void;
}

export const PublicActionsContext = createContext<PublicActions>({
  signedIn: false,
  signingIn: false,
  signIn: () => undefined,
});

export const usePublicActions = () => useContext(PublicActionsContext);
