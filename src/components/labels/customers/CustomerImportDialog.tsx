import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useCustomerImport } from '@/hooks/labels/useCustomerImport';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerImportDialog({ open, onOpenChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { importing, parseResult, stats, parseFile, runImport, reset } = useCustomerImport();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await parseFile(file);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Customers</DialogTitle>
          <DialogDescription>Upload an Excel file to bulk-import customers and contacts.</DialogDescription>
        </DialogHeader>

        {!parseResult && !stats && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="rounded-full bg-muted p-4">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Select Excel File
            </Button>
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFileChange} />
            <p className="text-xs text-muted-foreground">Accepts .xls and .xlsx files</p>
          </div>
        )}

        {parseResult && !stats && (
          <div className="space-y-4 py-2">
            <h3 className="font-medium text-sm text-foreground">Preview</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-semibold text-foreground">{parseResult.companies.length}</p>
                <p className="text-muted-foreground">Companies</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-semibold text-foreground">
                  {parseResult.companies.reduce((sum, c) => sum + c.contacts.length, 0)}
                </p>
                <p className="text-muted-foreground">Contacts</p>
              </div>
            </div>
            {parseResult.multiEmailContacts > 0 && (
              <p className="text-xs text-muted-foreground">
                {parseResult.multiEmailContacts} contact(s) with multiple email addresses
              </p>
            )}
            {parseResult.skippedRows > 0 && (
              <p className="text-xs text-amber-600">
                {parseResult.skippedRows} row(s) skipped (missing company or contact name)
              </p>
            )}
          </div>
        )}

        {stats && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              {stats.errors.length === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              <h3 className="font-medium text-sm text-foreground">Import Complete</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Companies created</span><Badge variant="default">{stats.companiesCreated}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Companies existing</span><Badge variant="secondary">{stats.companiesSkipped}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Contacts added</span><Badge variant="default">{stats.contactsCreated}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Contacts skipped</span><Badge variant="secondary">{stats.contactsSkipped}</Badge></div>
            </div>
            {stats.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded border p-2 text-xs text-destructive">
                {stats.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {parseResult && !stats && (
            <Button onClick={runImport} disabled={importing}>
              {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {importing ? 'Importing...' : `Import ${parseResult.companies.length} Companies`}
            </Button>
          )}
          {stats && (
            <Button variant="outline" onClick={() => handleClose(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
