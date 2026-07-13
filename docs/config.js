/**
 * CPLUS预约会议系统 — 云端配置
 * 按「一步一步」填好后保存，再上传到 GitHub
 *
 * 注意：anon key 设计为可公开（配合数据库规则）
 * 访问码 accessPin 请改成你们自己的，只告诉老板/同事
 */
window.CPLUS_CONFIG = {
  // 第 2 步在 Supabase 拿到后粘贴（不要有多余空格）
  supabaseUrl: "PASTE_SUPABASE_URL",
  supabaseAnonKey: "PASTE_SUPABASE_ANON_KEY",

  // 访问码：留空 = 扫码直接进，不用输密码
  accessPin: "",
};
