import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Mail, Lock, CheckCircle, Eye, Package, Palette } from 'lucide-react';
import { useClientAuth } from '@/hooks/labels/useClientAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const features = [
  { icon: Eye, title: 'Review Proofs', description: 'View high-quality proofs of your labels before production' },
  { icon: CheckCircle, title: 'Approve Artwork', description: 'Approve or request changes with a single click' },
  { icon: Package, title: 'Track Orders', description: 'Follow your orders from approval through to completion' },
  { icon: Palette, title: 'Upload Artwork', description: 'Submit replacement artwork directly through the portal' },
];

export default function ClientPortalLogin() {
  const navigate = useNavigate();
  const { login } = useClientAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome to the Client Portal');
      navigate('/labels/portal');
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingReset(true);
    try {
      const { data, error } = await supabase.functions.invoke('label-client-auth/forgot-password', {
        body: { email: forgotEmail },
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      toast.error('Failed to send reset email. Please try again.');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Hero Panel */}
      <div className="relative lg:w-1/2 bg-primary text-primary-foreground p-8 lg:p-16 flex flex-col justify-center overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary-foreground/20" />
          <div className="absolute bottom-[-15%] left-[-5%] w-[400px] h-[400px] rounded-full bg-primary-foreground/10" />
          <div className="absolute top-[40%] left-[30%] w-[200px] h-[200px] rounded-full bg-primary-foreground/5" />
        </div>

        <div className="relative z-10 max-w-lg mx-auto lg:mx-0">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-xl bg-primary-foreground/15 backdrop-blur-sm">
              <Package className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">PrintStream</h1>
              <p className="text-sm opacity-80">Label Division</p>
            </div>
          </div>

          <h2 className="text-3xl lg:text-4xl font-bold mb-4 leading-tight">
            Your labels,{' '}
            <span className="opacity-80">reviewed & approved</span>{' '}
            in one place.
          </h2>
          <p className="text-lg opacity-70 mb-12">
            Review proofs, approve artwork, and track your label orders — all from your personalised portal.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex items-start gap-3 p-3 rounded-lg bg-primary-foreground/5 backdrop-blur-sm"
              >
                <div className="p-1.5 rounded-md bg-primary-foreground/10 mt-0.5">
                  <feature.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">{feature.title}</p>
                  <p className="text-xs opacity-60 leading-snug mt-0.5">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form Panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-16 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h3 className="text-2xl font-bold text-foreground">
              {forgotMode ? 'Reset Password' : 'Welcome back'}
            </h3>
            <p className="text-muted-foreground mt-2">
              {forgotMode
                ? resetSent
                  ? 'Check your email for a reset link'
                  : 'Enter your email to receive a password reset link'
                : 'Sign in to your client portal to manage your label orders'}
            </p>
          </div>

          {forgotMode ? (
            resetSent ? (
              <Card className="border-0 shadow-none bg-muted/50">
                <CardContent className="p-6 text-center space-y-4">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    If an account exists with that email, you'll receive a password reset link shortly.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { setForgotMode(false); setResetSent(false); }}
                  >
                    Back to Sign In
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="your@email.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="pl-10 h-11"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11" disabled={isSendingReset}>
                  {isSendingReset ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  type="button"
                  onClick={() => setForgotMode(false)}
                >
                  Back to Sign In
                </Button>
              </form>
            )
          ) : (
            <>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Button
                      variant="link"
                      className="p-0 h-auto text-xs text-muted-foreground hover:text-primary"
                      type="button"
                      onClick={() => { setForgotMode(true); setForgotEmail(email); }}
                    >
                      Forgot password?
                    </Button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-11"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 text-base" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
              <p className="text-sm text-muted-foreground text-center">
                Need access? Contact your print representative.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
