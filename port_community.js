const fs = require('fs');

const adminPath = 'app/(admin)/community.tsx';
const studentPath = 'app/(student)/community.tsx';

let content = fs.readFileSync(adminPath, 'utf8');

// 1. Rename Component
content = content.replace('export default function CommunityScreen() {', 'export default function StudentCommunityScreen() {');

// 2. Change Auth Store bindings
content = content.replace(
  'const { user, businessId, businessCode, businessName, avatarUrl } = useAuthStore();',
  `const { user, studentData } = useAuthStore();
  const businessId = studentData?.business_id;
  const businessCode = studentData?.business_code;
  const businessName = studentData?.business_name;
  const avatarUrl = studentData?.avatar_url;
  const isAdmin = false;`
);

// 3. Disable New Post Button
content = content.replace(
  '<TouchableOpacity onPress={() => setShowComposer(!showComposer)}>',
  '{isAdmin && <TouchableOpacity onPress={() => setShowComposer(!showComposer)}>'
);
content = content.replace(
  '{showComposer ? \'Cancel\' : \'New Post\'}\n            </Text>\n          </TouchableOpacity>',
  '{showComposer ? \'Cancel\' : \'New Post\'}\n            </Text>\n          </TouchableOpacity>}'
);

// 4. Disable Composer
content = content.replace(
  '{showComposer && (',
  '{isAdmin && showComposer && ('
);

// 5. Disable Edit/Delete Menu in Post Header
content = content.replace(
  'const isOwnPost = item.author_id === user?.id;',
  'const isOwnPost = isAdmin && item.author_id === user?.id;' // Ensure students can't edit/delete even if they somehow have the same ID (unlikely but safe)
);

// 6. Update Supabase Fetch Query
content = content.replace(
  'let query = supabase\n        .from(\'community_posts\')\n        .select(\'*\')\n        .eq(\'business_id\', businessId);',
  `let query = supabase
        .from('community_posts')
        .select('*')
        .eq('business_id', businessId)
        .or(\`target_batches.is.null,target_batches.cs.{\${studentData?.batch_name}}\`);`
);

// 7. Update Realtime Channel filter (optional but good for student)
content = content.replace(
  `filter: 'business_id=eq.' + businessId`,
  `filter: 'business_id=eq.' + businessId // Student relies on client-side filter or RLS`
);

// 8. Make sure PostCard is passed isAdmin=false (or since we modified isOwnPost inside PostCard, we need to pass isAdmin)
content = content.replace(
  'function PostCard({ item, onLike, onAddComment, onAddReply, onEdit, onDelete, avatarMap, onVote, downloadingFileId, onViewDocument, isAdmin = true }: PostCardProps) {',
  'function PostCard({ item, onLike, onAddComment, onAddReply, onEdit, onDelete, avatarMap, onVote, downloadingFileId, onViewDocument, isAdmin = false }: PostCardProps) {'
);

// Add isAdmin to PostCard uses (Skipped since signature handles it)

// Replace any leftover occurrences of isOwnPost logic in PostCard
// Actually, I already added isAdmin=false default and modified `isOwnPost = isAdmin && ...` but let's make sure it handles it if it's declared globally.
content = content.replace(
  'const isOwnPost = item.author_id === user?.id;',
  'const isOwnPost = isAdmin && item.author_id === user?.id;'
);

fs.writeFileSync(studentPath, content, 'utf8');
console.log('Successfully ported community.tsx to student space.');
