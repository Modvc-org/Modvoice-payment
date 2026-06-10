
import React, { useEffect, useRef, useState } from 'react';
import { X, Layout, Users, Trash2, Loader2, Upload, ImageIcon, Shield, Crown, UserMinus, Hammer, Check, ShieldAlert, Link as LinkIcon, Lock, Plus, ChevronDown, ChevronRight, Github } from 'lucide-react';
import { Button } from './Button';
import { Server, ServerMember, MemberRole, Role, Permission, PERMISSION_INFO, hasPermission } from '../types';
import { serverService } from '../services/serverStore';
import { useToast } from '../context/ToastContext';
import { uploadFileToR2 } from '../../src/lib/r2';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';


interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: Server;
  members: ServerMember[];
  currentMember: ServerMember | null;
  onDeleteServer: () => void;
  onUpdate?: () => void;
}

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  isOpen,
  onClose,
  server,
  members,
  currentMember,
  onDeleteServer,
  onUpdate
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'roles' | 'bans' | 'monetization'>('overview');
  
  // Overview State
  const [serverName, setServerName] = useState(server.name);
  const [iconUrl, setIconUrl] = useState(server.iconUrl || '');
  const [bannerUrl, setBannerUrl] = useState(server.bannerUrl || '');
  const [inviteBackgroundUrl, setInviteBackgroundUrl] = useState(server.inviteBackgroundUrl || '');
  const [inviteCode, setInviteCode] = useState(server.inviteCode);
  
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Monetization State
  const [stripeSecretKey, setStripeSecretKey] = useState(server.stripeSecretKey ? '••••••••••••••••••••••••••••••••' : '');
  const [stripePublishableKey, setStripePublishableKey] = useState(server.stripePublishableKey || '');
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState(server.stripeWebhookSecret ? '••••••••••••••••••••••••••••••••' : '');

  // Members State
  const [searchTerm, setSearchTerm] = useState('');
  const [editingMemberRoles, setEditingMemberRoles] = useState<string | null>(null);

  // Roles State
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [roleSubTab, setRoleSubTab] = useState<'display' | 'permissions'>('display');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Bans State
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [isLoadingBans, setIsLoadingBans] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
      if (activeTab === 'bans' && server.banned?.length) {
          setIsLoadingBans(true);
          Promise.all(server.banned.map(async (uid) => {
              const d = await getDoc(doc(db, "users", uid));
              if (d.exists()) return { uid, ...d.data() };
              return { uid, displayName: "Unknown User" };
          })).then(res => {
              setBannedUsers(res);
              setIsLoadingBans(false);
          });
      } else if (activeTab === 'bans') {
          setBannedUsers([]);
      }
  }, [activeTab, server.banned]);

  const handleUnban = async (uid: string) => {
      setRevokingId(uid);
      try {
          await serverService.unbanMember(server.id, uid);
          setBannedUsers(prev => prev.filter(u => u.uid !== uid));
          showToast("User unbanned", "success");
      } catch {
          showToast("Failed to unban user", "error");
      } finally {
          setRevokingId(null);
      }
  };

  // Load roles when the modal opens (needed for both members and roles tabs)
  useEffect(() => {
      if (!isOpen) return;
      setIsLoadingRoles(true);
      const unsub = serverService.subscribeToRoles(server.id, async (fetched) => {
          // Auto-create @everyone if no roles exist
          if (fetched.length === 0) {
              await serverService.createDefaultRole(server.id);
              return; // next snapshot will trigger
          }
          setRoles(fetched);
          setIsLoadingRoles(false);
          
          // Maintain active role reference or fallback to first
          setActiveRole(prev => {
              if (!prev) return fetched[0];
              return fetched.find(r => r.id === prev.id) || fetched[0];
          });
      });
      return () => unsub();
  }, [isOpen, server.id]);

  const handleCreateRole = async () => {
      const newRole: Omit<Role, 'id'> = {
          name: 'new role',
          color: '#99aab5',
          order: roles.length,
          permissions: []
      };
      const id = await serverService.createRole(server.id, newRole);
      setActiveRole({ id, ...newRole } as Role);
  };

  const handleUpdateRole = async (roleId: string, updates: Partial<Role>) => {
      // Optimistically update activeRole if it's the one being edited
      if (activeRole?.id === roleId) {
          setActiveRole(prev => prev ? { ...prev, ...updates } : prev);
      }
      await serverService.updateRole(server.id, roleId, updates);
  };

  const handleDeleteRole = async (roleId: string) => {
      await serverService.deleteRole(server.id, roleId);
  };

  const togglePermission = (roleId: string, perm: Permission) => {
      const role = roles.find(r => r.id === roleId);
      if (!role) return;
      
      let newPerms = [...(role.permissions || [])];
      if (newPerms.includes(perm)) {
          newPerms = newPerms.filter(p => p !== perm);
      } else {
          newPerms.push(perm);
      }
      handleUpdateRole(roleId, { permissions: newPerms });
  };

  const iconInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const inviteBackgroundInputRef = useRef<HTMLInputElement>(null);

  const canEditServer = hasPermission(currentMember, roles, 'MANAGE_SERVER' as Permission, server.ownerId);
  const canDeleteServer = currentMember?.role === 'owner' || currentMember?.uid === server.ownerId;
  const canManageRoles = hasPermission(currentMember, roles, 'MANAGE_ROLES' as Permission, server.ownerId);
  const canBanMembers = hasPermission(currentMember, roles, 'BAN_MEMBERS' as Permission, server.ownerId);
  const canKickMembers = hasPermission(currentMember, roles, 'KICK_MEMBERS' as Permission, server.ownerId);
  const canManageMembers = canKickMembers || canBanMembers || canEditServer;

  // Feature Gating: Custom Invite features available if a Server Banner is set (per user request)
  const isCustomInviteUnlocked = !!bannerUrl;

  useEffect(() => {
    if (isOpen) {
        setServerName(server.name);
        setIconUrl(server.iconUrl || '');
        setBannerUrl(server.bannerUrl || '');
        setInviteBackgroundUrl(server.inviteBackgroundUrl || '');
        setInviteCode(server.inviteCode);
        
        // Sync Stripe keys when switching servers
        setStripePublishableKey(server.stripePublishableKey || '');
        setStripeSecretKey(server.stripeSecretKey ? '••••••••••••••••••••••••••••••••' : '');
        setStripeWebhookSecret(server.stripeWebhookSecret ? '••••••••••••••••••••••••••••••••' : '');
        
        if (canEditServer) setActiveTab('overview');
        else if (canManageMembers) setActiveTab('members');
        else if (canManageRoles) setActiveTab('roles');
        else if (canBanMembers) setActiveTab('bans');
        else setActiveTab('overview');

        setDeleteConfirm(false);
    }
  }, [isOpen, server]);

  const toggleMemberRole = async (memberId: string, roleId: string) => {
      const member = members.find(m => m.uid === memberId);
      if (!member) return;
      const current = member.roleIds || [];
      const newRoleIds = current.includes(roleId) ? current.filter(r => r !== roleId) : [...current, roleId];
      
      let legacyRole = member.role;
      if (member.role !== 'owner') {
          const assignedRoles = roles.filter(r => newRoleIds.includes(r.id));
          legacyRole = assignedRoles.some(r => r.permissions?.includes('ADMINISTRATOR' as Permission)) ? 'admin' : 'member';
      }

      try {
          await serverService.updateMemberRoles(server.id, memberId, newRoleIds, legacyRole);
          showToast('Roles updated', 'success');
      } catch {
          showToast('Failed to update roles', 'error');
      }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
      if (file.size > 5 * 1024 * 1024) {
          showToast("Image too large (max 5MB)", "error");
          return null;
      }
      try {
          const url = await uploadFileToR2(file);
          return url;
      } catch (e: any) {
          showToast(`Upload failed: ${e.message}`, "error");
          return null;
      }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploading(true);
      const url = await uploadImage(file);
      if (url) setIconUrl(url);
      setIsUploading(false);
      if (iconInputRef.current) iconInputRef.current.value = '';
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploading(true);
      const url = await uploadImage(file);
      if (url) setBannerUrl(url);
      setIsUploading(false);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const handleInviteBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploading(true);
      const url = await uploadImage(file);
      if (url) setInviteBackgroundUrl(url);
      setIsUploading(false);
      if (inviteBackgroundInputRef.current) inviteBackgroundInputRef.current.value = '';
  };

  const saveOverview = async () => {
      if (!canEditServer) return;
      
      // Validation for custom invite code
      if (inviteCode !== server.inviteCode) {
          if (!isCustomInviteUnlocked) {
               showToast("Must have a server banner to use custom invite codes.", "error");
               return;
          }
          if (inviteCode.length < 4) {
              showToast("Invite code must be at least 4 characters.", "error");
              return;
          }
          const taken = await serverService.isInviteCodeTaken(inviteCode, server.id);
          if (taken) {
              showToast("This invite code is already taken.", "error");
              return;
          }
      }

      setIsSaving(true);
      try {
          await serverService.updateServer(server.id, {
              name: serverName,
              iconUrl,
              bannerUrl,
              inviteBackgroundUrl,
              inviteCode
          });
          
          if (onUpdate) onUpdate();
          showToast("Server settings updated", "success");
      } catch (e) {
          showToast("Failed to update server", "error");
      } finally {
          setIsSaving(false);
      }
  };

  const saveMonetization = async () => {
      if (!canEditServer) return;
      setIsSaving(true);
      try {
          const response = await fetch('/api/stripe-keys', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                serverId: server.id,
                userId: currentMember?.uid,
                stripePublishableKey,
                stripeSecretKey,
                stripeWebhookSecret
             })
          });
          
          const data = await response.json();
          if (!data.success) throw new Error(data.error);

          if (onUpdate) onUpdate();
          showToast("Monetization settings updated securely!", "success");
      } catch (e: any) {
          showToast(`Failed to update settings: ${e.message}`, "error");
      } finally {
          setIsSaving(false);
      }
  };

  const handleRoleChange = async (targetMemberId: string, newRole: MemberRole) => {
      if (!currentMember) return;
      
      // Permission Check
      if (currentMember.role !== 'owner') {
          // Admins can only promote to Admin or demote to Member, but cannot touch other Admins or Owner
          // Actually, let's keep it simple: Owner can do anything. Admin can only manage Members.
          const targetMember = members.find(m => m.uid === targetMemberId);
          if (targetMember?.role === 'owner' || targetMember?.role === 'admin') {
              showToast("You cannot modify this user's role.", "error");
              return;
          }
          if (newRole === 'owner') {
              showToast("Only owners can transfer ownership.", "error");
              return;
          }
      }

      try {
          await serverService.updateMemberRole(server.id, targetMemberId, newRole);
          showToast("Role updated", "success");
      } catch (e) {
          showToast("Failed to update role", "error");
      }
  };

  const handleKick = async (targetMemberId: string) => {
      if (!currentMember) return;
      const targetMember = members.find(m => m.uid === targetMemberId);
      
      if (targetMember?.role === 'owner') {
          showToast("Cannot kick the server owner.", "error");
          return;
      }

      // Admin cannot kick other Admins
      if (currentMember.role === 'admin' && targetMember?.role === 'admin') {
          showToast("Admins cannot kick other admins.", "error");
          return;
      }

      if (confirm(`Kick ${targetMember?.displayName}?`)) {
          try {
              await serverService.kickMember(server.id, targetMemberId);
              showToast("Member kicked", "info");
          } catch (e) {
              showToast("Failed to kick member", "error");
          }
      }
  };

  const handleBan = async (targetMemberId: string) => {
      if (!currentMember) return;
      const targetMember = members.find(m => m.uid === targetMemberId);
      
      if (targetMember?.role === 'owner') {
          showToast("Cannot ban the server owner.", "error");
          return;
      }

      // Admin cannot ban other Admins
      if (currentMember.role === 'admin' && targetMember?.role === 'admin') {
          showToast("Admins cannot ban other admins.", "error");
          return;
      }

      if (confirm(`Are you sure you want to PERMANENTLY BAN ${targetMember?.displayName}? They will not be able to rejoin via invite links.`)) {
          try {
              await serverService.banMember(server.id, targetMemberId);
              showToast("Member permanently banned", "info");
          } catch (e) {
              showToast("Failed to ban member", "error");
          }
      }
  };

  if (!isOpen) return null;

  const filteredMembers = members.filter(m => 
      m.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div 
        className="bg-[#181818] w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-4xl sm:rounded-xl border-t sm:border border-mod-border shadow-2xl flex flex-col md:flex-row overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
          {/* Sidebar */}
          <div className="w-full md:w-[240px] bg-[#111] border-b md:border-b-0 md:border-r border-mod-border p-4 flex flex-row md:flex-col gap-2 overflow-x-auto shrink-0 z-10">
              <h2 className="hidden md:block text-xs font-bold text-mod-muted uppercase mb-4 px-2 tracking-wider">
                  {server.name}
              </h2>

              {canEditServer && (
                  <button 
                      onClick={() => setActiveTab('overview')}
                      className={`flex-1 md:flex-none flex items-center justify-center md:justify-start gap-3 px-3 py-2 rounded-md font-medium transition-colors text-sm whitespace-nowrap ${activeTab === 'overview' ? 'bg-mod-card text-white' : 'text-mod-muted hover:text-white hover:bg-mod-card/50'}`}
                  >
                      <Layout className="w-4 h-4" />
                      Overview
                  </button>
              )}

              {canManageMembers && (
                  <button 
                      onClick={() => setActiveTab('members')}
                      className={`flex-1 md:flex-none flex items-center justify-center md:justify-start gap-3 px-3 py-2 rounded-md font-medium transition-colors text-sm whitespace-nowrap ${activeTab === 'members' ? 'bg-mod-card text-white' : 'text-mod-muted hover:text-white hover:bg-mod-card/50'}`}
                  >
                      <Users className="w-4 h-4" />
                      Members
                      <span className="ml-auto bg-[#222] px-1.5 rounded text-[10px] hidden md:block">{members.length}</span>
                  </button>
              )}

              {canManageRoles && (
                  <button 
                      onClick={() => setActiveTab('roles')}
                      className={`flex-1 md:flex-none flex items-center justify-center md:justify-start gap-3 px-3 py-2 rounded-md font-medium transition-colors text-sm whitespace-nowrap ${activeTab === 'roles' ? 'bg-mod-card text-white' : 'text-mod-muted hover:text-white hover:bg-mod-card/50'}`}
                  >
                      <Shield className="w-4 h-4" />
                      Roles
                  </button>
              )}

              {canBanMembers && (
                  <button 
                      onClick={() => setActiveTab('bans')}
                      className={`flex-1 md:flex-none flex items-center justify-center md:justify-start gap-3 px-3 py-2 rounded-md font-medium transition-colors text-sm whitespace-nowrap ${activeTab === 'bans' ? 'bg-red-500/10 text-red-500' : 'text-mod-muted hover:text-white hover:bg-mod-card/50'}`}
                  >
                      <Hammer className="w-4 h-4" />
                      Bans
                      <span className="ml-auto bg-[#222] px-1.5 rounded text-[10px] hidden md:block">{server.banned?.length || 0}</span>
                  </button>
              )}

              {canEditServer && (
                  <button 
                      onClick={() => setActiveTab('monetization')}
                      className={`flex-1 md:flex-none flex items-center justify-center md:justify-start gap-3 px-3 py-2 rounded-md font-medium transition-colors text-sm whitespace-nowrap ${activeTab === 'monetization' ? 'bg-indigo-500/10 text-indigo-400' : 'text-mod-muted hover:text-white hover:bg-mod-card/50'}`}
                  >
                      <Lock className="w-4 h-4" />
                      Monetization
                  </button>
              )}

              {canDeleteServer && (
                  <div className="md:mt-auto md:border-t md:border-mod-border md:pt-4">
                      <button 
                          onClick={() => { setActiveTab('overview'); setDeleteConfirm(true); }}
                          className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-2 rounded-md font-medium transition-colors text-sm whitespace-nowrap text-red-500 hover:bg-red-500/10"
                      >
                          <Trash2 className="w-4 h-4" />
                          Delete Server
                      </button>
                  </div>
              )}
          </div>

          {/* Content */}
          <div className="flex-1 p-4 md:p-10 flex flex-col relative overflow-y-auto bg-[#181818] pb-safe scrollbar-thin scrollbar-thumb-mod-border">
              <button onClick={onClose} className="absolute top-4 right-4 text-mod-muted hover:text-white z-20 p-2 border border-mod-border rounded-full bg-[#181818] shadow-lg">
                  <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold text-white mb-6">
                  {activeTab === 'overview' && 'Server Overview'}
                  {activeTab === 'members' && 'Manage Members'}
                  {activeTab === 'roles' && 'Roles'}
                  {activeTab === 'bans' && 'Banned Users'}
                  {activeTab === 'monetization' && 'Stripe Monetization'}
              </h2>

              {activeTab === 'monetization' && canEditServer && (
                  <div className="space-y-6 max-w-2xl">
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 mb-6">
                          <h3 className="text-indigo-400 font-bold mb-2 flex items-center gap-2">
                              <Lock className="w-4 h-4" /> Bring Your Own Gateway (0% Fees)
                          </h3>
                          <p className="text-sm text-gray-300 leading-relaxed">
                              ModVoice takes a 0% cut of your sales. Enter your Stripe keys below. When users buy products or server boosts, we will use your Stripe account to process the payment directly to your bank account.
                          </p>
                      </div>

                      <div className="space-y-4">
                          <div>
                              <label className="text-xs font-bold text-mod-muted uppercase mb-1 block">Stripe Publishable Key</label>
                              <input 
                                  type="text" 
                                  value={stripePublishableKey}
                                  onChange={(e) => setStripePublishableKey(e.target.value)}
                                  placeholder="pk_live_..."
                                  className="w-full bg-[#0a0a0a] border border-mod-border text-white rounded-md p-3 focus:outline-none focus:border-mod-green font-mono text-sm"
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-mod-muted uppercase mb-1 block">Stripe Secret Key</label>
                              <input 
                                  type="password" 
                                  value={stripeSecretKey}
                                  onChange={(e) => setStripeSecretKey(e.target.value)}
                                  placeholder="sk_live_..."
                                  className="w-full bg-[#0a0a0a] border border-mod-border text-white rounded-md p-3 focus:outline-none focus:border-mod-green font-mono text-sm"
                              />
                              <p className="text-[10px] text-gray-500 mt-1">This key is securely encrypted on our servers and only used to generate Checkout sessions on your behalf.</p>
                          </div>
                          <div>
                              <label className="text-xs font-bold text-mod-muted uppercase mb-1 block">Webhook Secret</label>
                              <input 
                                  type="password" 
                                  value={stripeWebhookSecret}
                                  onChange={(e) => setStripeWebhookSecret(e.target.value)}
                                  placeholder="whsec_..."
                                  className="w-full bg-[#0a0a0a] border border-mod-border text-white rounded-md p-3 focus:outline-none focus:border-mod-green font-mono text-sm"
                              />
                              <div className="text-[10px] text-gray-500 mt-2 space-y-1 bg-[#0a0a0a] p-3 rounded-md border border-mod-border">
                                  <p className="font-semibold text-gray-400 mb-2">How to set up your Stripe Webhook:</p>
                                  <ol className="list-decimal list-inside space-y-1 ml-1">
                                      <li>Go to your Stripe Dashboard &gt; <strong>Developers</strong> &gt; <strong>Webhooks</strong>.</li>
                                      <li>Click <strong>Add an endpoint</strong>.</li>
                                      <li>Set Endpoint URL to: <code className="bg-[#1a1a1a] px-1 py-0.5 rounded text-mod-green select-all">https://modvc.org/api/stripe-webhook</code></li>
                                      <li>Under "Select events to listen to", search for and check: <code className="bg-[#1a1a1a] px-1 py-0.5 rounded text-blue-400 select-all">checkout.session.completed</code></li>
                                      <li>Click <strong>Add endpoint</strong>.</li>
                                      <li>On the new endpoint page, click "Reveal" under <strong>Signing secret</strong> (starts with <code>whsec_...</code>) and paste it here.</li>
                                  </ol>
                              </div>
                          </div>
                      </div>

                      <div className="mt-6 p-3 bg-green-500/10 border border-green-500/20 rounded-md flex items-center gap-3">
                          <Lock className="w-5 h-5 text-green-400 shrink-0" />
                          <div>
                              <div className="text-sm font-bold text-green-400">Secured with AES-256 Edge Encryption</div>
                              <div className="text-xs text-green-400/80">API keys are instantly encrypted on the server edge. They are mathematically impossible to extract via client-side XSS.</div>
                          </div>
                      </div>

                      <a href="https://github.com/Modvc-org/Modvoice-payment" target="_blank" rel="noopener noreferrer" className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-md flex items-center gap-3 hover:bg-blue-500/20 transition-colors block cursor-pointer">
                          <Github className="w-5 h-5 text-blue-400 shrink-0" />
                          <div>
                              <div className="text-sm font-bold text-blue-400">100% Open Source Architecture</div>
                              <div className="text-xs text-blue-400/80">Our payment integration is fully open-sourced for transparency. Click here to audit the GitHub repository.</div>
                          </div>
                      </a>

                      <div className="pt-6 flex items-center gap-4 border-t border-mod-border mt-6">
                          <Button onClick={saveMonetization} loading={isSaving}>
                              Save Monetization Settings
                          </Button>
                      </div>
                  </div>
              )}

              {activeTab === 'overview' && canEditServer && (
                  <div className="space-y-8 max-w-2xl">
                      {/* Banners & Icons */}
                      <div className="flex flex-col sm:flex-row gap-8">
                          {/* Icon Upload */}
                          <div className="flex flex-col items-center gap-3">
                              <div className="relative group w-24 h-24">
                                  <div className="w-24 h-24 rounded-[20px] overflow-hidden bg-zinc-800 border-2 border-[#111] shadow-lg">
                                      <img src={iconUrl || server.iconUrl} alt="" className="w-full h-full object-cover" />
                                  </div>
                                  {canEditServer && (
                                      <div 
                                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-[20px] cursor-pointer"
                                          onClick={() => iconInputRef.current?.click()}
                                      >
                                          <span className="text-xs font-bold text-white uppercase text-center">Change<br/>Icon</span>
                                      </div>
                                  )}
                                  {isUploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-[20px]"><Loader2 className="animate-spin text-white"/></div>}
                              </div>
                              <span className="text-xs text-mod-muted uppercase font-bold">Icon</span>
                          </div>

                          {/* Banner Upload */}
                          <div className="flex flex-col gap-3 flex-1 w-full">
                               <div className="relative group w-full h-24 bg-zinc-800 rounded-lg overflow-hidden border border-mod-border">
                                   {bannerUrl ? (
                                       <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
                                   ) : (
                                       <div className="w-full h-full flex items-center justify-center text-mod-muted">
                                           <ImageIcon className="w-8 h-8 opacity-20" />
                                       </div>
                                   )}
                                   {canEditServer && (
                                      <div 
                                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                          onClick={() => bannerInputRef.current?.click()}
                                      >
                                          <span className="text-xs font-bold text-white uppercase flex items-center gap-2">
                                              <Upload className="w-4 h-4" /> Change Banner
                                          </span>
                                      </div>
                                  )}
                               </div>
                               <span className="text-xs text-mod-muted uppercase font-bold">Server Banner</span>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <label className="text-xs font-bold text-mod-muted uppercase">Server Name</label>
                          <input 
                              type="text" 
                              value={serverName}
                              onChange={(e) => setServerName(e.target.value)}
                              disabled={!canEditServer}
                              className="w-full bg-[#0a0a0a] border border-mod-border text-white rounded-md p-3 focus:outline-none focus:border-mod-green font-medium disabled:opacity-50"
                          />
                      </div>

                      {/* Invite Settings */}
                      <div className="pt-4 border-t border-mod-border">
                          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                              <LinkIcon size={16} /> Invite Customization
                          </h3>

                          <div className="space-y-6">
                              {/* Custom Code */}
                              <div>
                                  <label className="text-xs font-bold text-mod-muted uppercase mb-2 flex items-center justify-between">
                                      <span>Custom Invite Code</span>
                                      {!isCustomInviteUnlocked && <span className="text-xs text-yellow-500 flex items-center gap-1"><Lock size={10} /> Requires Banner</span>}
                                  </label>
                                  <div className="flex items-center gap-2">
                                      <div className="bg-[#0a0a0a] border border-mod-border rounded-l-md px-3 py-3 text-mod-muted select-none text-sm">
                                          modvc.org/invite/
                                      </div>
                                      <input 
                                          type="text" 
                                          value={inviteCode}
                                          onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                                          disabled={!canEditServer || !isCustomInviteUnlocked}
                                          className="flex-1 bg-[#0a0a0a] border border-mod-border text-white rounded-r-md p-3 focus:outline-none focus:border-mod-green font-mono uppercase disabled:opacity-50"
                                          placeholder={server.inviteCode}
                                      />
                                  </div>
                              </div>

                              {/* Invite Background */}
                              <div>
                                  <label className="text-xs font-bold text-mod-muted uppercase mb-2">Invite Page Background</label>
                                  <div className="flex items-start gap-4">
                                      <div className="w-32 h-20 bg-zinc-800 rounded-lg border border-mod-border overflow-hidden relative group shrink-0">
                                          {inviteBackgroundUrl ? (
                                              <img src={inviteBackgroundUrl} alt="" className="w-full h-full object-cover" />
                                          ) : (
                                              <div className="w-full h-full flex items-center justify-center text-mod-muted bg-[#111]">
                                                  <ImageIcon size={20} />
                                              </div>
                                          )}
                                          {canEditServer && (
                                              <div 
                                                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                                  onClick={() => inviteBackgroundInputRef.current?.click()}
                                              >
                                                  <Upload size={16} className="text-white" />
                                              </div>
                                          )}
                                      </div>
                                      <div className="text-xs text-mod-muted pt-1">
                                          <p>Upload a custom background image for your invite page.</p>
                                          {inviteBackgroundUrl && canEditServer && (
                                              <button onClick={() => setInviteBackgroundUrl('')} className="text-red-400 hover:text-red-300 mt-2 hover:underline">
                                                  Remove Background
                                              </button>
                                          )}
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {canEditServer && (
                          <div className="pt-4 flex items-center gap-4">
                              <Button onClick={saveOverview} loading={isSaving} disabled={isUploading}>
                                  Save Changes
                              </Button>
                              <Button variant="ghost" onClick={() => {
                                  setServerName(server.name);
                                  setIconUrl(server.iconUrl || '');
                                  setBannerUrl(server.bannerUrl || '');
                                  setInviteBackgroundUrl(server.inviteBackgroundUrl || '');
                                  setInviteCode(server.inviteCode);
                              }}>Reset</Button>
                          </div>
                      )}

                      {/* Hidden Inputs */}
                      <input type="file" ref={iconInputRef} className="hidden" accept="image/*" onChange={handleIconUpload} />
                      <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={handleBannerUpload} />
                      <input type="file" ref={inviteBackgroundInputRef} className="hidden" accept="image/*" onChange={handleInviteBackgroundUpload} />

                      {/* Delete Zone */}
                      {deleteConfirm && canDeleteServer && (
                          <div className="mt-8 bg-red-500/10 border border-red-500/20 rounded-lg p-6 animate-in slide-in-from-bottom-4">
                              <h3 className="text-red-500 font-bold text-lg flex items-center gap-2 mb-2">
                                  <ShieldAlert /> Delete Server
                              </h3>
                              <p className="text-gray-300 text-sm mb-6">
                                  Are you sure you want to delete <strong>{server.name}</strong>? This action cannot be undone.
                              </p>
                              <div className="flex gap-4">
                                  <Button variant="danger" onClick={onDeleteServer}>Yes, Delete Server</Button>
                                  <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                              </div>
                          </div>
                      )}
                  </div>
              )}

              {activeTab === 'members' && canManageMembers && (
                  <div className="flex flex-col h-full">
                      <div className="mb-4">
                          <input 
                              type="text" 
                              placeholder="Search members..." 
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full bg-[#0a0a0a] border border-mod-border rounded-md px-3 py-2 text-white focus:border-mod-green outline-none"
                          />
                      </div>
                      
                      <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                          {filteredMembers.map(member => {
                              const memberCustomRoles = roles.filter(r => member.roleIds?.includes(r.id) && !r.isDefault);
                              return (
                              <div key={member.uid} className="rounded-lg hover:bg-mod-card group transition-colors">
                                  <div className="flex items-center justify-between p-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                      <img src={member.photoURL} className="w-10 h-10 rounded-full bg-[#222] object-cover shrink-0" alt="" />
                                      <div className="min-w-0">
                                          <div className="text-white font-medium flex items-center gap-2">
                                              {member.displayName}
                                              {member.role === 'owner' && <Crown className="w-3 h-3 text-yellow-500 fill-current" />}
                                          </div>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                              {memberCustomRoles.map(r => (
                                                  <span key={r.id} className="text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1" style={{ borderColor: r.color + '40', color: r.color, backgroundColor: r.color + '15' }}>
                                                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                                                      {r.name}
                                                  </span>
                                              ))}
                                              {memberCustomRoles.length === 0 && <span className="text-[10px] text-mod-muted">No roles</span>}
                                          </div>
                                      </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                      {/* Role Assignment Button */}
                                      {canManageRoles && member.uid !== server.ownerId && (
                                          <button 
                                              onClick={() => setEditingMemberRoles(editingMemberRoles === member.uid ? null : member.uid)}
                                              className={`p-2 rounded-md transition-colors text-sm ${editingMemberRoles === member.uid ? 'bg-mod-green/20 text-mod-green' : 'text-mod-muted hover:text-white hover:bg-mod-card'}`}
                                              title="Manage Roles"
                                          >
                                              <Shield className="w-4 h-4" />
                                          </button>
                                      )}

                                      {/* Kick Button */}
                                      {canEditServer && member.uid !== currentMember?.uid && member.uid !== server.ownerId && (
                                          <button 
                                              onClick={() => handleKick(member.uid)}
                                              className="p-2 text-mod-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                              title="Kick Member"
                                          >
                                              <UserMinus className="w-4 h-4" />
                                          </button>
                                      )}

                                      {/* Ban Button */}
                                      {canEditServer && member.uid !== currentMember?.uid && member.uid !== server.ownerId && (
                                          <button 
                                              onClick={() => handleBan(member.uid)}
                                              className="p-2 text-mod-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                              title="Ban Member (Permanent)"
                                          >
                                              <Hammer className="w-4 h-4" />
                                          </button>
                                      )}
                                  </div>
                                  </div>

                                  {/* Role Assignment Panel */}
                                  {editingMemberRoles === member.uid && (
                                      <div className="px-3 pb-3 border-t border-mod-border/30 mt-1 pt-2">
                                          <div className="text-[10px] font-bold text-mod-muted uppercase mb-2">Assign Roles</div>
                                          <div className="flex flex-wrap gap-1.5">
                                              {roles.filter(r => !r.isDefault).map(role => {
                                                  const hasRole = member.roleIds?.includes(role.id);
                                                  return (
                                                      <button 
                                                          key={role.id}
                                                          onClick={() => toggleMemberRole(member.uid, role.id)}
                                                          className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5 transition-all ${hasRole ? 'border-opacity-60' : 'border-mod-border/40 text-gray-500 hover:text-gray-300'}`}
                                                          style={hasRole ? { borderColor: role.color, color: role.color, backgroundColor: role.color + '20' } : {}}
                                                      >
                                                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                                                          {role.name}
                                                          {hasRole && <Check size={10} />}
                                                      </button>
                                                  );
                                              })}
                                              {roles.filter(r => !r.isDefault).length === 0 && (
                                                  <span className="text-xs text-mod-muted">No custom roles created yet. Go to Roles tab to create some.</span>
                                              )}
                                          </div>
                                      </div>
                                  )}
                              </div>
                              );
                          })}
                      </div>
                  </div>
              )}

              {activeTab === 'roles' && canManageRoles && (
                  <div className="flex flex-col md:flex-row h-full -mx-4 -mb-4 md:-mx-10 md:-mb-10">
                      {/* Left Sidebar: Role List */}
                      <div className="w-full md:w-[240px] bg-[#2B2D31] border-r border-mod-border p-4 flex flex-col shrink-0">
                          <div className="flex justify-between items-center mb-4">
                              <h3 className="text-xs font-bold text-mod-muted uppercase">Roles</h3>
                              <button onClick={handleCreateRole} className="p-1 hover:bg-mod-card rounded text-gray-400 hover:text-white" title="Create Role">
                                  <Plus size={16} />
                              </button>
                          </div>
                          
                          {isLoadingRoles ? (
                              <div className="flex items-center justify-center py-4"><Loader2 className="animate-spin text-mod-muted" /></div>
                          ) : (
                              <div className="flex-1 overflow-y-auto space-y-1">
                                  {roles.map(role => (
                                      <button 
                                          key={role.id}
                                          onClick={() => setActiveRole(role)}
                                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm ${activeRole?.id === role.id ? 'bg-[#3F4147] text-white' : 'text-gray-400 hover:bg-[#35373C] hover:text-gray-200'}`}
                                      >
                                          <div className="flex items-center gap-2 truncate">
                                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                                              <span className="truncate">{role.name}</span>
                                          </div>
                                      </button>
                                  ))}
                              </div>
                          )}
                      </div>

                      {/* Right Content: Edit Role */}
                      <div className="flex-1 bg-[#313338] p-6 overflow-y-auto">
                          {activeRole ? (
                              <div className="max-w-2xl mx-auto">
                                  <div className="flex items-center justify-between mb-8">
                                      <h3 className="text-lg font-bold text-white uppercase tracking-wider">Edit Role — {activeRole.name}</h3>
                                      {!activeRole.isDefault && (
                                          <button onClick={() => handleDeleteRole(activeRole.id)} className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500/10 rounded-full transition-colors" title="Delete Role">
                                              <Trash2 size={18} />
                                          </button>
                                      )}
                                  </div>

                                  <div className="space-y-6">
                                      {/* Display Settings */}
                                      <div>
                                          <label className="text-xs font-bold text-mod-muted uppercase mb-2 block">Role Name</label>
                                          <input 
                                              type="text" 
                                              value={activeRole.name}
                                              onChange={(e) => handleUpdateRole(activeRole.id, { name: e.target.value })}
                                              disabled={activeRole.isDefault}
                                              className="w-full bg-[#1E1F22] border border-[#1E1F22] text-white rounded-md p-2.5 focus:outline-none focus:border-mod-green disabled:opacity-50"
                                          />
                                      </div>

                                      <div>
                                          <label className="text-xs font-bold text-mod-muted uppercase mb-2 block">Role Color</label>
                                          <div className="flex items-center gap-3">
                                              <input 
                                                  type="color" 
                                                  value={activeRole.color}
                                                  onChange={(e) => handleUpdateRole(activeRole.id, { color: e.target.value })}
                                                  className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent p-0"
                                              />
                                              <div className="text-sm text-gray-400 font-mono">{activeRole.color}</div>
                                          </div>
                                      </div>

                                      <div className="pt-2">
                                          <label className="text-xs font-bold text-mod-muted uppercase mb-2 block">Message Cooldown (Slowmode)</label>
                                          <select 
                                              value={activeRole.messageCooldown || 0}
                                              onChange={(e) => handleUpdateRole(activeRole.id, { messageCooldown: parseInt(e.target.value) })}
                                              className="w-full bg-[#1E1F22] border border-[#1E1F22] text-white rounded-md p-2.5 focus:outline-none focus:border-mod-green"
                                          >
                                              <option value={0}>Off</option>
                                              <option value={5}>5 seconds</option>
                                              <option value={10}>10 seconds</option>
                                              <option value={15}>15 seconds</option>
                                              <option value={30}>30 seconds</option>
                                              <option value={60}>1 minute</option>
                                              <option value={120}>2 minutes</option>
                                              <option value={300}>5 minutes</option>
                                              <option value={600}>10 minutes</option>
                                              <option value={900}>15 minutes</option>
                                              <option value={1800}>30 minutes</option>
                                              <option value={3600}>1 hour</option>
                                              <option value={7200}>2 hours</option>
                                              <option value={21600}>6 hours</option>
                                          </select>
                                          <p className="text-xs text-mod-muted mt-2">Restricts members in this role from sending messages back-to-back.</p>
                                      </div>

                                      {/* Permissions by Category */}
                                      <div className="pt-6 border-t border-mod-border">
                                          <h4 className="text-xs font-bold text-mod-muted uppercase mb-4">Permissions</h4>
                                          {(() => {
                                              const categories: Record<string, { key: string; info: typeof PERMISSION_INFO[string] }[]> = {};
                                              Object.entries(PERMISSION_INFO).forEach(([key, info]) => {
                                                  if (!categories[info.category]) categories[info.category] = [];
                                                  categories[info.category].push({ key, info });
                                              });
                                              return Object.entries(categories).map(([category, perms]) => (
                                                  <div key={category} className="mb-6">
                                                      <button 
                                                          onClick={() => setCollapsedCategories(prev => ({ ...prev, [category]: !prev[category] }))}
                                                          className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase mb-3 hover:text-white transition-colors w-full"
                                                      >
                                                          {collapsedCategories[category] ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                                          {category} Permissions
                                                      </button>
                                                      {!collapsedCategories[category] && (
                                                          <div className="space-y-3 ml-1">
                                                              {perms.map(({ key, info }) => {
                                                                  const isEnabled = activeRole.permissions?.includes(key as Permission);
                                                                  const isAdmin = key === 'ADMINISTRATOR';
                                                                  return (
                                                                      <div key={key} className={`flex items-center justify-between pb-3 border-b border-mod-border/30 ${isAdmin ? 'bg-red-500/5 -mx-2 px-2 py-2 rounded-lg border border-red-500/20' : ''}`}>
                                                                          <div className="pr-4">
                                                                              <div className={`text-sm font-medium mb-0.5 ${isAdmin ? 'text-red-400' : 'text-gray-200'}`}>{info.label}</div>
                                                                              <div className="text-xs text-gray-500 leading-relaxed">{info.description}</div>
                                                                          </div>
                                                                          <button 
                                                                              onClick={() => togglePermission(activeRole.id, key as Permission)}
                                                                              className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${isEnabled ? (isAdmin ? 'bg-red-500' : 'bg-mod-green') : 'bg-gray-600'}`}
                                                                          >
                                                                              <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform shadow-sm ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                                                          </button>
                                                                      </div>
                                                                  );
                                                              })}
                                                          </div>
                                                      )}
                                                  </div>
                                              ));
                                          })()}
                                      </div>
                                  </div>
                              </div>
                          ) : (
                              <div className="flex items-center justify-center h-full text-mod-muted">
                                  Select a role to edit
                              </div>
                          )}
                      </div>
                  </div>
              )}

              {activeTab === 'bans' && canBanMembers && (
                  <div className="max-w-3xl mx-auto w-full space-y-4">
                      {isLoadingBans ? (
                          <div className="flex items-center justify-center p-10 text-mod-muted">
                              <Loader2 className="w-8 h-8 animate-spin" />
                          </div>
                      ) : bannedUsers.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-mod-border rounded-xl">
                              <Hammer className="w-12 h-12 text-mod-muted mb-4 opacity-50" />
                              <h3 className="text-white font-bold mb-1">No Banned Users</h3>
                              <p className="text-mod-muted text-sm">There are currently no users banned from this server.</p>
                          </div>
                      ) : (
                          bannedUsers.map(user => (
                              <div key={user.uid} className="flex items-center justify-between p-4 bg-[#111] rounded-xl border border-mod-border">
                                  <div className="flex items-center gap-4">
                                      <img 
                                          src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`} 
                                          alt="" 
                                          className="w-10 h-10 rounded-full"
                                      />
                                      <div>
                                          <div className="text-white font-medium">{user.displayName}</div>
                                          <div className="text-xs text-mod-muted">ID: {user.uid}</div>
                                      </div>
                                  </div>
                                  
                                  {canEditServer && (
                                      <Button 
                                          onClick={() => handleUnban(user.uid)}
                                          variant="secondary"
                                          size="sm"
                                          loading={revokingId === user.uid}
                                          className="hover:bg-red-500/10 hover:text-red-500 border border-transparent hover:border-red-500/20"
                                      >
                                          Revoke Ban
                                      </Button>
                                  )}
                              </div>
                          ))
                      )}
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};
