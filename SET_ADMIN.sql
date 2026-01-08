-- =====================================================
-- Set Your User as Admin
-- Replace 'your-email@example.com' with your actual email
-- =====================================================

UPDATE user_profiles 
SET 
  role = 'admin',
  status = 'approved',
  has_limits = false,  -- Admin has no limits
  approved_at = NOW(),
  approved_by = id  -- Self-approved
WHERE email = 'your-email@example.com';

-- Verify admin was created
SELECT id, email, role, status, has_limits 
FROM user_profiles 
WHERE role = 'admin';
