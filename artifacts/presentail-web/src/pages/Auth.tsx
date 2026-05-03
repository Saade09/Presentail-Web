import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin, useRegister } from "@/lib/queries";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import authBg from "@/assets/hero.png";
import { useLocale } from "@/contexts/LocaleContext";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const { login: setAuth } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLocale();
  
  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLogin) {
        const res = await loginMutation.mutateAsync({ email: formData.email, password: formData.password });
        if (res.ok) {
          setAuth(res.token, res.user);
          setLocation("/account");
        } else {
          toast({ title: t("auth.toast.loginFailed"), description: t("auth.toast.invalidCreds"), variant: "destructive" });
        }
      } else {
        const res = await registerMutation.mutateAsync(formData);
        if (res.ok) {
          if (res.token) {
            setAuth(res.token, res.user);
            setLocation("/account");
          } else {
            toast({
              title: t("auth.toast.created"),
              description: t("auth.toast.createdDesc"),
            });
            setIsLogin(true);
          }
        } else {
          toast({ title: t("auth.toast.regFailed"), description: t("auth.toast.regFailedDesc"), variant: "destructive" });
        }
      }
    } catch (error: any) {
      toast({ title: t("auth.toast.error"), description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex pt-20">
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-12 md:px-24">
        <div className="max-w-md w-full mx-auto space-y-8">
          <div>
            <h1 className="text-4xl font-serif mb-2">{isLogin ? t("auth.welcome") : t("auth.create")}</h1>
            <p className="text-muted-foreground">
              {isLogin ? t("auth.signinDesc") : t("auth.signupDesc")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("auth.firstName")}</label>
                  <Input required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("auth.lastName")}</label>
                  <Input required value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("auth.email")}</label>
              <Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("auth.password")}</label>
              <Input type="password" required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} minLength={8} />
            </div>

            <Button type="submit" size="lg" className="w-full h-14 rounded-xl mt-6" disabled={loginMutation.isPending || registerMutation.isPending}>
              {isLogin ? t("auth.signin") : t("auth.create")}
            </Button>
          </form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">
              {isLogin ? t("auth.noAccount") : t("auth.haveAccount")}
            </span>
            <button type="button" onClick={() => setIsLogin(!isLogin)} className="font-medium hover:text-primary transition-colors">
              {isLogin ? t("auth.signup") : t("auth.signin")}
            </button>
          </div>
        </div>
      </div>
      
      <div className="hidden lg:block lg:flex-1 relative bg-secondary">
        <img src={authBg} alt={t("auth.heroAlt")} className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <blockquote className="text-3xl font-serif leading-snug mb-4">
            {t("auth.quote")}
          </blockquote>
          <p className="opacity-80">{t("auth.atelier")}</p>
        </div>
      </div>
    </div>
  );
}
