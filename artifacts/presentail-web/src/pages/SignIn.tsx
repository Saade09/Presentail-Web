import { SignIn } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { useClerkAuthBasePath } from "@/lib/clerkAuthPath";

// Mounted at `/{lang}-{country}/{city}/sign-in` (relative to wouter's nested
// router base). Clerk's `<SignIn>` needs a STABLE absolute base path for
// its `path` prop — every internal sub-route (verify-email, factor-one,
// ...) is rendered under the same component, so we must always pass the
// `/sign-in` mount path itself, never `window.location.pathname` (which
// would include the active sub-step and break the multi-step flow).
export default function SignInPage() {
  const base = useClerkAuthBasePath();
  return (
    <div className="min-h-screen flex items-center justify-center pt-24 pb-24 px-4 bg-background">
      <SignIn
        path={`${base}/sign-in`}
        routing="path"
        signUpUrl={`${base}/sign-up`}
        appearance={{ baseTheme: shadcn }}
      />
    </div>
  );
}
