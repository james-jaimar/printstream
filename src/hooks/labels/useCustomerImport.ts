import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parseCustomerExcel, type CustomerImportParseResult, type ParsedCompany } from '@/utils/labels/customerImport';

export interface CustomerImportStats {
  companiesCreated: number;
  companiesSkipped: number;
  contactsCreated: number;
  contactsSkipped: number;
  errors: string[];
}

export function useCustomerImport() {
  const [importing, setImporting] = useState(false);
  const [parseResult, setParseResult] = useState<CustomerImportParseResult | null>(null);
  const [stats, setStats] = useState<CustomerImportStats | null>(null);
  const queryClient = useQueryClient();

  const parseFile = useCallback(async (file: File) => {
    const result = await parseCustomerExcel(file);
    setParseResult(result);
    setStats(null);
    return result;
  }, []);

  const runImport = useCallback(async () => {
    if (!parseResult) return;
    setImporting(true);
    const stats: CustomerImportStats = { companiesCreated: 0, companiesSkipped: 0, contactsCreated: 0, contactsSkipped: 0, errors: [] };

    try {
      // Fetch all existing customers for duplicate check
      const { data: existingCustomers } = await supabase
        .from('label_customers')
        .select('id, company_name');

      const existingMap = new Map<string, string>();
      (existingCustomers || []).forEach((c: any) => {
        existingMap.set(c.company_name.toLowerCase(), c.id);
      });

      for (const company of parseResult.companies) {
        try {
          const key = company.companyName.toLowerCase();
          let customerId = existingMap.get(key);

          if (customerId) {
            stats.companiesSkipped++;
          } else {
            // Create customer
            const { data, error } = await supabase
              .from('label_customers')
              .insert({
                company_name: company.companyName,
                billing_address: company.billingAddress,
                notes: company.rep ? `Rep: ${company.rep}` : null,
              })
              .select('id')
              .single();

            if (error) throw error;
            customerId = (data as any).id;
            stats.companiesCreated++;
            existingMap.set(key, customerId!);
          }

          // Fetch existing contacts for this customer to avoid duplicates
          const { data: existingContacts } = await supabase
            .from('label_customer_contacts')
            .select('name, email')
            .eq('customer_id', customerId!);

          const existingContactSet = new Set(
            (existingContacts || []).map((c: any) => `${c.name?.toLowerCase()}|${c.email?.toLowerCase()}`)
          );

          // Insert contacts in batches
          const contactsToInsert = company.contacts
            .filter(c => {
              const contactKey = `${c.name.toLowerCase()}|${c.email.toLowerCase()}`;
              if (existingContactSet.has(contactKey)) {
                stats.contactsSkipped++;
                return false;
              }
              return true;
            })
            .map((c, i) => ({
              customer_id: customerId!,
              name: c.name,
              email: c.email || 'no-email@placeholder.com',
              phone: c.phone,
              role: c.role || 'contact',
              is_primary: i === 0 && !existingContacts?.length, // primary only if no existing contacts
              receives_proofs: true,
              receives_notifications: true,
              can_approve_proofs: true,
            }));

          if (contactsToInsert.length > 0) {
            // Batch in groups of 50
            for (let i = 0; i < contactsToInsert.length; i += 50) {
              const batch = contactsToInsert.slice(i, i + 50);
              const { error } = await supabase
                .from('label_customer_contacts')
                .insert(batch);
              if (error) {
                stats.errors.push(`${company.companyName}: ${error.message}`);
              } else {
                stats.contactsCreated += batch.length;
              }
            }
          }
        } catch (err: any) {
          stats.errors.push(`${company.companyName}: ${err.message}`);
        }
      }

      setStats(stats);
      queryClient.invalidateQueries({ queryKey: ['label_customers'] });
      queryClient.invalidateQueries({ queryKey: ['label_customer_contacts'] });

      if (stats.errors.length === 0) {
        toast.success(`Imported ${stats.companiesCreated} companies, ${stats.contactsCreated} contacts`);
      } else {
        toast.warning(`Import done with ${stats.errors.length} error(s)`);
      }
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }, [parseResult, queryClient]);

  const reset = useCallback(() => {
    setParseResult(null);
    setStats(null);
  }, []);

  return { importing, parseResult, stats, parseFile, runImport, reset };
}
