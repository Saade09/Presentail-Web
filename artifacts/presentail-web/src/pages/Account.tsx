import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { User, Package, MapPin, LogOut } from "lucide-react";

export default function Account() {
  const { user, logout, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return <div className="min-h-screen pt-32 text-center">Loading...</div>;

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  return (
    <div className="min-h-screen pt-24 pb-24 bg-background">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-4xl font-serif mb-12">My Account</h1>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <div className="p-4 bg-secondary/50 rounded-xl cursor-pointer border border-primary/10 flex items-center gap-3">
              <User className="w-5 h-5 text-primary" />
              <span className="font-medium">Profile Details</span>
            </div>
            <div className="p-4 hover:bg-secondary/50 rounded-xl cursor-pointer transition-colors flex items-center gap-3">
              <Package className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">Order History</span>
            </div>
            <div className="p-4 hover:bg-secondary/50 rounded-xl cursor-pointer transition-colors flex items-center gap-3">
              <MapPin className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">Saved Addresses</span>
            </div>
            <div 
              className="p-4 hover:bg-destructive/10 hover:text-destructive rounded-xl cursor-pointer transition-colors flex items-center gap-3 text-muted-foreground mt-8"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="bg-secondary/30 rounded-3xl p-8 border border-border/50">
              <h2 className="text-2xl font-serif mb-6">Profile Details</h2>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground block mb-1">First Name</label>
                    <p className="font-medium text-lg">{user.firstName || "Not provided"}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground block mb-1">Last Name</label>
                    <p className="font-medium text-lg">{user.lastName || "Not provided"}</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Email Address</label>
                  <p className="font-medium text-lg">{user.email}</p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Phone Number</label>
                  <p className="font-medium text-lg">{user.phone || "Not provided"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
