from supabase import create_client


SUPABASE_URL = ("https://mvgpeiejwstrxjmfslke.supabase.co")
SUPABASE_SERVICE_KEY = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Z3BlaWVqd3N0cnhqbWZzbGtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTU5MTA0NiwiZXhwIjoyMDg1MTY3MDQ2fQ.zT0elcBzlmIR7VYFn2aY_o4a0w9NcPdzNmcvFrCL1CA")

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY
)