'use strict';
// Keep credential values in process environment; never serialize them into build config.
function signingConfiguration(env = process.env) {
  const mode = env.MEMOFLOW_WINDOWS_SIGNING?.trim() || 'none';
  if (!['none', 'certificate', 'azure'].includes(mode)) throw Error('签名模式无效：请使用 none、certificate 或 azure');
  const requireValue = name => {
    const value = env[name]?.trim();
    if (!value) throw Error('签名配置缺少 ' + name + '；请配置后重新构建');
    if (/[\r\n\0]/.test(value)) throw Error('签名配置格式无效：' + name);
    return value;
  };
  if (mode === 'none') {
    if (env.MEMOFLOW_REQUIRE_SIGNING === 'true') throw Error('此构建要求正式签名，但尚未启用签名服务或证书');
    return { mode, publisher: '', build: { forceCodeSigning: false, win: { signExecutable: false, verifyUpdateCodeSignature: true } } };
  }
  const publisher = requireValue('MEMOFLOW_SIGNING_PUBLISHER');
  const win = { signExecutable: true, verifyUpdateCodeSignature: true };
  if (mode === 'certificate') {
    const thumbprint = env.MEMOFLOW_CERTIFICATE_SHA1?.trim();
    if (thumbprint && !/^[a-fA-F0-9]{40}$/.test(thumbprint)) throw Error('证书指纹必须是 40 位十六进制字符');
    if (!thumbprint && !env.WIN_CSC_LINK && !env.CSC_LINK) throw Error('未配置签名证书：需要 WIN_CSC_LINK 或硬件证书的 MEMOFLOW_CERTIFICATE_SHA1');
    win.signtoolOptions = {
      publisherName: publisher,
      signingHashAlgorithms: ['sha256'],
      rfc3161TimeStampServer: 'http://timestamp.digicert.com',
      ...(thumbprint ? { certificateSha1: thumbprint } : {})
    };
  } else {
    const endpoint = requireValue('MEMOFLOW_AZURE_SIGNING_ENDPOINT');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.endsWith('.codesigning.azure.net') || !['', '/'].includes(url.pathname) || url.search || url.hash) throw Error('Azure 签名端点必须是官方 HTTPS 区域端点');
    for (const field of ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET']) requireValue(field);
    win.azureSignOptions = {
      publisherName: publisher,
      endpoint,
      certificateProfileName: requireValue('MEMOFLOW_AZURE_CERTIFICATE_PROFILE'),
      codeSigningAccountName: requireValue('MEMOFLOW_AZURE_SIGNING_ACCOUNT'),
      fileDigest: 'SHA256', timestampDigest: 'SHA256', timestampRfc3161: 'http://timestamp.acs.microsoft.com'
    };
  }
  return { mode, publisher, build: { forceCodeSigning: true, win } };
}
function validateSignature(result, publisher) {
  if (result.status !== 'Valid') throw Error('Windows 不信任此文件的签名：' + (result.file || '未知文件'));
  if (result.subject !== publisher && result.commonName !== publisher) throw Error('签名发布者与配置不一致：' + (result.file || '未知文件'));
  if (!result.timestamped) throw Error('签名缺少可信时间戳：' + (result.file || '未知文件'));
  return result;
}
module.exports = { signingConfiguration, validateSignature };
if (require.main === module) {
  try {
    const config = signingConfiguration();
    console.log(config.mode === 'none' ? '未启用正式签名：当前安装包仍会显示未知发布者。' : '签名参数已配置；只有构建后通过 Windows 信任和发布者校验，才可标记为已签名。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
