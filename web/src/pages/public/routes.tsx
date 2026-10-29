import type { ComponentType } from "react";
import Demo from "./Demo";
import Home, { homeJsonLd } from "./Home";
import HowItWorks from "./HowItWorks";
import Pricing from "./Pricing";
import Privacy from "./Privacy";
import Terms from "./Terms";

/** Component and structured data per public path. Metadata lives in seo/pages.ts. */
export const PUBLIC_ROUTES: Record<string, { Component: ComponentType; jsonLd?: object }> = {
  "/": { Component: Home, jsonLd: homeJsonLd },
  "/demo": { Component: Demo },
  "/how-it-works": { Component: HowItWorks },
  "/pricing": { Component: Pricing },
  "/privacy": { Component: Privacy },
  "/terms": { Component: Terms },
};
