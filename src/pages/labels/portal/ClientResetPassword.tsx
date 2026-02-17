import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, Lock, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function ClientResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('label-client-auth/reset-password', {
        body: { token, new_password: password },
      });
      if (error || data?.error) throw new Error(data?.error || 'Reset failed');
      setIsSuccess(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Hero Panel */}
        <div className="relative lg:w-1/2 bg-primary text-primary-foreground p-8 lg:p-16 flex flex-col justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary-foreground/20" />
            <div className="absolute bottom-[-15%] left-[-5%] w-[400px] h-[400px] rounded-full bg-primary-foreground/10" />
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
              Reset your password
            </h2>
            <p className="text-lg opacity-70">
              Securely update your portal credentials.
            </p>
          </div>
        </div>
        <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-16 bg-background">
          <div className="w-full max-w-md space-y-6 text-center">
            <p className="text-destructive font-medium">Invalid reset link. Please request a new password reset.</p>
            <Button className="bg-[#00B8D4] hover:bg-[#0097A7] text-white w-full h-11" onClick={() => navigate('/labels/portal/login')}>
              Back to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Hero Panel */}
        <div className="relative lg:w-1/2 bg-primary text-primary-foreground p-8 lg:p-16 flex flex-col justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary-foreground/20" />
            <div className="absolute bottom-[-15%] left-[-5%] w-[400px] h-[400px] rounded-full bg-primary-foreground/10" />
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
              Password updated!
            </h2>
            <p className="text-lg opacity-70">
              Your credentials have been securely updated.
            </p>
          </div>
        </div>
        <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-16 bg-background">
          <div className="w-full max-w-md space-y-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-foreground">Password Reset Successfully</h3>
              <p className="text-muted-foreground mt-2">You can now sign in with your new password.</p>
            </div>
            <Button className="bg-[#00B8D4] hover:bg-[#0097A7] text-white w-full h-11" onClick={() => navigate('/labels/portal/login')}>
              Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Hero Panel */}
      <div className="relative lg:w-1/2 bg-primary text-primary-foreground p-8 lg:p-16 flex flex-col justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary-foreground/20" />
          <div className="absolute bottom-[-15%] left-[-5%] w-[400px] h-[400px] rounded-full bg-primary-foreground/10" />
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
            Reset your password
          </h2>
          <p className="text-lg opacity-70">
            Choose a new secure password for your client portal account.
          </p>
        </div>
      </div>

      {/* Form Panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-16 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h3 className="text-2xl font-bold text-foreground">New Password</h3>
            <p className="text-muted-foreground mt-2">Enter your new password below</p>
          </div>
          <form onSubmit={handleReset} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 h-11"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 text-base bg-[#00B8D4] hover:bg-[#0097A7] text-white" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
