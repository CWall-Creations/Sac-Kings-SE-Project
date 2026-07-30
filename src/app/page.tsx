import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";

/**
 * The dashboard is a single page.
 *
 * `Dashboard` is a Client Component because filter state lives in the URL and the
 * charts are interactive. The Suspense boundary is required rather than optional:
 * `useSearchParams` suspends during static rendering, so without it this page
 * could not be prerendered.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
