import { SignUp } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { useClerkAuthBasePath } from "@/lib/clerkAuthPath";

// See SignIn.tsx — same locale-prefix-aware path derivation.
export default function SignUpPage() {
  const base = useClerkAuthBasePath();
  return (
    <div className="min-h-screen flex items-center justify-center pt-24 pb-24 px-4 bg-background">
      <SignUp
        path={`${base}/sign-up`}
        routing="path"
        signInUrl={`${base}/sign-in`}
        appearance={{ baseTheme: shadcn }}
      />
    </div>
  );
}
