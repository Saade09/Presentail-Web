import { Link } from "wouter";
import { Button } from "@/components/ui/button";

// Shown when a Clerk-authenticated user lands on a customer-only page but
// carries a non-customer `publicMetadata.userType` (driver / team / future
// roles). Public pages remain reachable; this is a friendly dead-end.
export default function Unauthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-24 bg-background">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-4xl font-serif">You're signed in elsewhere</h1>
        <p className="text-muted-foreground">
          This account isn't a Presentail shopper. Switch to a customer
          account to access your orders and profile.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/">
            <Button variant="default">Back to shop</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
