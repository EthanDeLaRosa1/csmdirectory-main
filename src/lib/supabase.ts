import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://njytnjkxtxsccasgeapn.supabase.co";

// Replace the string below with your exact Publishable / anon key from Supabase
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qeXRuamt4dHhzY2Nhc2dlYXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDM2NTUsImV4cCI6MjEwMjIxOTY1NX0.dhx2rvIZT719mTaIcaHPz53hJknp--qezPrBH9jhO84";

console.log("Supabase URL initialized:", supabaseUrl);
console.log("Supabase Key length:", supabaseAnonKey.length);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);