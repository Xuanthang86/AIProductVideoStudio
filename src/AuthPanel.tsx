import { useEffect, useState } from 'react';
import { LockKeyhole, LogIn, LogOut, ShieldCheck, UserPlus, Users, X, Check, Ban, KeyRound } from 'lucide-react';

type User = { id:string; email:string; fullName:string; role:string; status:string; createdAt?:string; approvedAt?:string|null; lastLoginAt?:string|null };
type Props = { open:boolean; onClose:()=>void };
async function api(path:string, method='GET', data?:unknown) {
  const response = await fetch(path,{method,credentials:'include',headers:data?{'content-type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});
  const result = await response.json().catch(()=>({error:'Phản hồi máy chủ không hợp lệ.'}));
  if(!response.ok) throw new Error(result.error || 'Yêu cầu không thành công.');
  return result;
}
const roleName:Record<string,string> = {SUPER_ADMIN:'Super Admin',ADMIN:'Quản trị viên',EDITOR:'Biên tập viên',USER:'Người dùng'};
const statusName:Record<string,string> = {PENDING_APPROVAL:'Chờ duyệt',APPROVED:'Đã duyệt',REJECTED:'Từ chối',SUSPENDED:'Tạm ngưng',DISABLED:'Đã khóa'};

export default function AuthPanel({open,onClose}:Props) {
  const [mode,setMode] = useState<'login'|'register'|'account'>('login');
  const [user,setUser] = useState<User|null>(null);
  const [users,setUsers] = useState<User[]>([]);
  const [email,setEmail] = useState(''); const [fullName,setFullName] = useState('');
  const [password,setPassword] = useState(''); const [currentPassword,setCurrentPassword] = useState('');
  const [newPassword,setNewPassword] = useState(''); const [message,setMessage] = useState(''); const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
  const loadUsers = async () => { const result=await api('/api/admin/users'); setUsers(result.users || []); };
  useEffect(()=>{ if(open){setError('');setMessage('');api('/api/auth/me').then(r=>{if(r.user){setUser(r.user);setMode('account');}}).catch(()=>{});} },[open]);
  useEffect(()=>{ if(open && user && ['SUPER_ADMIN','ADMIN'].includes(user.role)) loadUsers().catch(e=>setError(e.message)); },[open,user?.id]);
  if(!open) return null;
  const run = async (task:()=>Promise<void>) => {setBusy(true);setError('');setMessage('');try{await task();}catch(e){setError(e instanceof Error?e.message:'Có lỗi xảy ra.');}finally{setBusy(false);}};
  const submitAuth = () => run(async()=>{
    if(mode==='register'){
      const result=await api('/api/auth/register','POST',{fullName,email,password});
      setMessage(result.message);setMode('login');setPassword('');
    }else{
      const result=await api('/api/auth/login','POST',{email,password});
      setUser(result.user);setMode('account');setPassword('');setMessage('Đăng nhập thành công.');
    }
  });
  const logout = () => run(async()=>{await api('/api/auth/logout','POST',{});setUser(null);setUsers([]);setMode('login');setMessage('Đã đăng xuất.');});
  const action = (id:string,verb:string,data?:unknown) => run(async()=>{await api('/api/admin/users/'+id+'/'+verb,'POST',data||{});await loadUsers();setMessage('Đã cập nhật tài khoản.');});
  const changePassword = () => run(async()=>{const r=await api('/api/auth/change-password','POST',{currentPassword,newPassword});setCurrentPassword('');setNewPassword('');setMessage(r.message);});
  return <div className="auth-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="auth-panel" role="dialog" aria-modal="true" aria-label="Tài khoản">
      <div className="auth-head"><div className="auth-brand"><span><ShieldCheck size={19}/></span><div><b>AI PRODUCT VIDEO STUDIO</b><small>TÀI KHOẢN & BẢO MẬT</small></div></div><button className="auth-close" onClick={onClose} aria-label="Đóng"><X/></button></div>
      {!user ? <div className="auth-content">
        <div className="auth-tabs"><button className={mode==='login'?'selected':''} onClick={()=>{setMode('login');setError('');}}>Đăng nhập</button><button className={mode==='register'?'selected':''} onClick={()=>{setMode('register');setError('');}}>Đăng ký</button></div>
        <h2>{mode==='login'?'Chào mừng trở lại':'Tạo tài khoản mới'}</h2><p className="auth-intro">{mode==='login'?'Đăng nhập bằng tài khoản đã được phê duyệt.':'Tài khoản mới cần được quản trị viên phê duyệt trước khi sử dụng Studio.'}</p>
        {mode==='register'&&<label>Họ và tên<input value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name" placeholder="Nguyễn Văn A"/></label>}
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="email@example.com"/></label>
        <label>Mật khẩu<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} placeholder="Tối thiểu 12 ký tự"/></label>
        <button className="auth-submit" disabled={busy||!email||!password||(mode==='register'&&!fullName)} onClick={submitAuth}>{mode==='login'?<LogIn size={17}/>:<UserPlus size={17}/>} {mode==='login'?'Đăng nhập':'Đăng ký tài khoản'}</button>
        <div className="auth-security"><LockKeyhole size={15}/> Mật khẩu được mã hóa trước khi lưu trữ; phiên đăng nhập dùng cookie bảo mật.</div>
      </div> : <div className="auth-content">
        <div className="account-summary"><span className="account-avatar">{user.fullName.slice(0,1).toUpperCase()}</span><div><h2>{user.fullName}</h2><p>{user.email}</p><div className="account-badges"><b>{roleName[user.role]||user.role}</b><span>{statusName[user.status]||user.status}</span></div></div></div>
        <div className="auth-section-title"><KeyRound size={17}/> Đổi mật khẩu</div>
        <div className="password-grid"><label>Mật khẩu hiện tại<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password"/></label><label>Mật khẩu mới<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password"/></label></div>
        <button className="auth-secondary" disabled={busy||!currentPassword||newPassword.length<12} onClick={changePassword}>Cập nhật mật khẩu</button>
        {['SUPER_ADMIN','ADMIN'].includes(user.role)&&<div className="admin-users"><div className="auth-section-title"><Users size={17}/> Quản lý tài khoản <span>{users.length}</span></div>
          {users.map(item=><div className="admin-user-row" key={item.id}><div className="admin-user-info"><b>{item.fullName}</b><small>{item.email}</small><span>{roleName[item.role]||item.role} · {statusName[item.status]||item.status}</span></div>
            {item.role!=='SUPER_ADMIN'&&<div className="admin-user-actions">
              {item.status==='PENDING_APPROVAL'&&<button title="Phê duyệt" onClick={()=>action(item.id,'approve')}><Check size={15}/></button>}
              {item.status==='APPROVED'?<button title="Khóa tài khoản" onClick={()=>action(item.id,'disable')}><Ban size={15}/></button>:item.status!=='PENDING_APPROVAL'&&<button title="Mở khóa / duyệt" onClick={()=>action(item.id,'enable')}><Check size={15}/></button>}
              {user.role==='SUPER_ADMIN'&&<button title="Đặt lại mật khẩu" onClick={()=>{const next=window.prompt('Nhập mật khẩu mới (ít nhất 12 ký tự):');if(next)action(item.id,'reset-password',{newPassword:next});}}><KeyRound size={15}/></button>}
              {user.role==='SUPER_ADMIN'&&<button title="Xóa tài khoản" onClick={()=>{if(window.confirm('Bạn chắc chắn muốn xóa tài khoản '+item.email+'?'))action(item.id,'delete');}}><X size={15}/></button>}
            </div>}
          </div>)}
        </div>}
        <button className="auth-logout" disabled={busy} onClick={logout}><LogOut size={16}/> Đăng xuất</button>
      </div>}
      {(message||error)&&<div className={error?'auth-message error':'auth-message'}>{error||message}</div>}
    </section>
  </div>;
}
