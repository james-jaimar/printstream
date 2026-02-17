import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, ArrowLeft, Loader2, User, KeyRound } from 'lucide-react';
import { useClientAuth } from '@/hooks/labels/useClientAuth';
import { toast } from 'sonner';
import impressLogo from '@/assets/impress-logo-colour.png';

export default function ClientAccount() {
  const navigate = useNavigate();
  const { contact, logout, changePassword } = useClientAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChanging, setIsChanging] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsChanging(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setIsChanging(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/labels/portal/login');
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(1100px_520px_at_50%_-140px,rgba(0,184,212,0.18),transparent_60%),linear-gradient(to_bottom,rgba(248,250,252,1),rgba(241,245,249,1))]">
      {/* Branded Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#00B8D4] to-[#0097A7]" />
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={impressLogo} alt="Impress" className="h-9 object-contain" />
            <div className="hidden sm:block h-7 w-px bg-slate-200" />
            <div className="hidden sm:block">
              <h1 className="font-semibold text-sm leading-tight text-slate-900">My Account</h1>
              <p className="text-[11px] text-slate-500 leading-tight">{contact?.company_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate('/labels/portal')}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline text-xs">Dashboard</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline text-xs">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        {/* Profile Info */}
        <Card className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="rounded-xl p-2 bg-[#00B8D4]/10">
                <User className="h-5 w-5 text-[#00B8D4]" />
              </div>
              Profile Information
            </CardTitle>
            <CardDescription>Your account details (read-only)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs">Name</Label>
              <p className="font-medium">{contact?.name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Email</Label>
              <p className="font-medium">{contact?.email}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Company</Label>
              <p className="font-medium">{contact?.company_name}</p>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="rounded-xl p-2 bg-[#00B8D4]/10">
                <KeyRound className="h-5 w-5 text-[#00B8D4]" />
              </div>
              Change Password
            </CardTitle>
            <CardDescription>Update your portal login password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current">Current Password</Label>
                <Input
                  id="current"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">New Password</Label>
                <Input
                  id="new"
                  type="password"
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-11"
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm New Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <Button type="submit" disabled={isChanging} className="bg-[#00B8D4] hover:bg-[#0097A7] text-white">
                {isChanging ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sign Out */}
        <Card className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur">
          <CardContent className="pt-6">
            <Button variant="outline" className="w-full" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
