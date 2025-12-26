# Aimee Test PM - Setup Guide

## Part 1: Create Supabase Project (5 minutes)

### 1.1 Sign Up / Log In
1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project" or "Sign In"
3. Sign up with GitHub (recommended) or email

### 1.2 Create New Project
1. Click "New Project"
2. Select your organization (or create one)
3. Fill in:
   - **Name:** `aimee-test-pm` (or whatever you like)
   - **Database Password:** Generate a strong one and **SAVE IT SOMEWHERE SAFE**
   - **Region:** Choose closest to you (e.g., EU West for UK)
4. Click "Create new project"
5. Wait 2-3 minutes for setup to complete

### 1.3 Get Your API Keys
Once the project is ready:
1. Go to **Settings** (gear icon in left sidebar)
2. Click **API** in the submenu
3. You'll need these values (keep this page open):
   - **Project URL** - looks like `https://xxxxx.supabase.co`
   - **anon public key** - a long string starting with `eyJ...`

---

## Part 2: Set Up Database Tables (10 minutes)

### 2.1 Open SQL Editor
1. In Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New query**

### 2.2 Run the Schema SQL
1. Copy the ENTIRE contents of the file `supabase-schema.sql` (provided separately)
2. Paste it into the SQL editor
3. Click **Run** (or press Cmd/Ctrl + Enter)
4. You should see "Success. No rows returned" - this is correct!

### 2.3 Verify Tables
1. Click **Table Editor** in the left sidebar
2. You should see these tables:
   - projects
   - project_members
   - project_customers
   - tasks
   - attachments

---

## Part 3: Set Up Storage for Attachments (5 minutes)

### 3.1 Create Storage Bucket
1. Click **Storage** in the left sidebar
2. Click **New bucket**
3. Fill in:
   - **Name:** `attachments`
   - **Public bucket:** Toggle ON (for simplicity in PoC)
   - **File size limit:** `10MB` or leave default
4. Click **Create bucket**

### 3.2 Set Storage Policies
1. Click on the `attachments` bucket
2. Click **Policies** tab
3. Click **New Policy**
4. Select **For full customization**
5. Create these policies:

**Policy 1: Allow authenticated uploads**
- Policy name: `Allow authenticated uploads`
- Allowed operation: `INSERT`
- Target roles: `authenticated`
- WITH CHECK expression: `true`
- Click **Review** then **Save policy**

**Policy 2: Allow authenticated downloads**
- Click **New Policy** again
- Policy name: `Allow authenticated downloads`
- Allowed operation: `SELECT`
- Target roles: `authenticated`
- USING expression: `true`
- Click **Review** then **Save policy**

**Policy 3: Allow authenticated deletes**
- Click **New Policy** again
- Policy name: `Allow authenticated deletes`
- Allowed operation: `DELETE`
- Target roles: `authenticated`
- USING expression: `true`
- Click **Review** then **Save policy**

---

## Part 4: Set Up Local Development (15 minutes)

### 4.1 Prerequisites
Make sure you have installed:
- **Node.js** (version 18 or higher) - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/)
- **VS Code** (recommended) - [Download here](https://code.visualstudio.com/)

### 4.2 Create Project Folder
Open Terminal (Mac) or Command Prompt (Windows):

```bash
# Navigate to where you want the project
cd ~/Documents  # or wherever you prefer

# Create project folder
mkdir aimee-test-pm
cd aimee-test-pm
```

### 4.3 Initialize the Project
```bash
# Initialize npm project
npm init -y

# Install dependencies
npm install react react-dom react-router-dom @supabase/supabase-js
npm install -D vite @vitejs/plugin-react tailwindcss postcss autoprefixer
```

### 4.4 Set Up Tailwind CSS
```bash
npx tailwindcss init -p
```

### 4.5 Copy Project Files
Copy ALL the files I've provided into your project folder, maintaining the folder structure:

```
aimee-test-pm/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.local          <-- YOU NEED TO CREATE THIS
├── src/
│   ├── main.jsx
│   ├── index.css
│   ├── App.jsx
│   ├── lib/
│   │   └── supabase.js
│   ├── contexts/
│   │   └── AuthContext.jsx
│   ├── components/
│   │   ├── Login.jsx
│   │   ├── ProtectedRoute.jsx
│   │   └── KanbanBoard.jsx
```

### 4.6 Create Environment File
Create a file called `.env.local` in the root folder with:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Replace with YOUR actual values from Part 1.3!

### 4.7 Run the App
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser!

---

## Part 5: Deploy to Vercel (10 minutes)

### 5.1 Push to GitHub
1. Create a new repository on [GitHub](https://github.com/new)
   - Name: `aimee-test-pm`
   - Keep it private if you prefer
   - Don't initialize with README

2. In your terminal:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/aimee-test-pm.git
git push -u origin main
```

### 5.2 Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "New Project"
3. Import your `aimee-test-pm` repository
4. In the configuration:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Click **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
6. Click **Deploy**

Your app will be live at `https://aimee-test-pm.vercel.app` (or similar)!

---

## Part 6: Configure Auth Redirect URLs

### 6.1 Update Supabase Auth Settings
1. In Supabase dashboard, go to **Authentication** > **URL Configuration**
2. Add your Vercel URL to **Redirect URLs**:
   - `https://your-app.vercel.app/**`
   - `http://localhost:5173/**` (for local dev)
3. Click **Save**

---

## Troubleshooting

### "Invalid API key"
- Double-check your `.env.local` values
- Make sure there are no extra spaces
- Restart the dev server after changing env vars

### "Permission denied" on database
- Make sure you ran the SQL schema correctly
- Check that RLS policies are set up (the schema SQL handles this)

### Attachments not uploading
- Verify the `attachments` bucket exists
- Check storage policies are created correctly

### Can't log in
- Check Supabase Authentication > Users to see if user was created
- Try the "Forgot Password" flow

---

## Next Steps After Setup

1. **Create your first account** - Sign up through the app
2. **Create a project** - Add team members and customers
3. **Add tasks** - Test all the features
4. **Upload attachments** - Verify storage works

Congratulations! You now have a fully functional PM tool! 🎉
