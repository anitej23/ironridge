# Iron Ridge Hauling Services website

Client site (home, services, about, quote form) plus an admin dashboard for Tommy.
Plain HTML, CSS and JavaScript. Hosted on GitHub Pages. Data in Supabase.

## Pages

| Page | File |
|---|---|
| Home | `index.html` |
| Services, areas, pricing FAQ | `services.html` |
| About | `about.html` |
| Quote form | `quote.html` + `js/quote.js` |
| Thank you | `thanks.html` |
| Admin login + dashboard | `admin/index.html` + `admin/admin.js` |

Anything in `[BRACKETS]` is a placeholder waiting on info from Tommy.
Search the project for `[` to find them all.

## Run it locally

1. Open the folder in VS Code.
2. Install the **Live Server** extension, right click `index.html` > **Open with Live Server**.
   (Opening the file by double clicking will not work for the quote form or admin page, because they use JavaScript modules.)

With no Supabase keys the site runs in **demo mode**: the quote form does not save anything and the admin page shows clearly labeled sample data.

## Put it on GitHub Pages

1. Create a repo (for example `iron-ridge-site`) under the Iron Ridge GitHub account.
2. In VS Code: Source Control > Initialize Repository > commit > Publish Branch.
3. On GitHub: Settings > Pages > Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`.
4. The site appears at `https://<account>.github.io/iron-ridge-site/` within a minute or two.

## Connect Supabase

1. Create a project at supabase.com (under the Iron Ridge account).
2. SQL Editor > paste all of `supabase/schema.sql` > Run.
3. Authentication > Users > **Add user** with Tommy's admin email and a strong password.
   Then run the `insert into public.admins ...` line at the bottom of `schema.sql` with his email.
4. Authentication > Providers > Email: turn **off** "Allow new users to sign up" so nobody else can create an account.
5. Project Settings > API: copy the **Project URL** and **anon public** key into `js/config.js`.
6. Commit and push. Test a quote request, then log in at `/admin/`.

**Security rules**
- The anon key is public by design. Row Level Security is what protects the data. Do not turn it off.
- Never put the `service_role` key in this repo.
- Never commit real customer data or exports.
- Free Supabase projects pause after about a week with no activity. Open the site or dashboard during testing.

## Analytics

- **Website traffic:** add Cloudflare Web Analytics (free, no cookie banner) or Google Analytics 4. Paste the snippet where each page says `ANALYTICS`.
- **Business numbers:** the admin dashboard shows requests, request to job rate, completed jobs, revenue, on time rate, feedback and referral sources.

## Custom domain (later)

Buy the domain, then GitHub > Settings > Pages > Custom domain, and add the DNS records GitHub shows. Nothing else moves.
