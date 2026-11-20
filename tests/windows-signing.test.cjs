'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {signingConfiguration,validateSignature}=require('../scripts/windows-signing.cjs');
test('unsigned mode is explicit and cannot satisfy required signing',()=>{
 const config=signingConfiguration({});assert.equal(config.mode,'none');assert.equal(config.build.win.signExecutable,false);assert.equal(config.build.win.verifyUpdateCodeSignature,true);
 assert.throws(()=>signingConfiguration({MEMOFLOW_REQUIRE_SIGNING:'true'}),/要求正式签名/);assert.throws(()=>signingConfiguration({MEMOFLOW_WINDOWS_SIGNING:'invalid'}),/模式无效/);
});
test('enabled signing needs an actual certificate and never serializes credential values',()=>{
 const env={MEMOFLOW_WINDOWS_SIGNING:'certificate',MEMOFLOW_SIGNING_PUBLISHER:'Example Verified Publisher'};
 assert.throws(()=>signingConfiguration(env),/未配置签名证书/);
 const config=signingConfiguration({...env,WIN_CSC_LINK:'private-certificate-payload',WIN_CSC_KEY_PASSWORD:'private-password'});
 assert.equal(config.build.forceCodeSigning,true);assert.equal(config.build.win.verifyUpdateCodeSignature,true);assert.deepEqual(config.build.win.signtoolOptions.signingHashAlgorithms,['sha256']);assert.equal(config.build.win.signtoolOptions.publisherName,env.MEMOFLOW_SIGNING_PUBLISHER);assert.doesNotMatch(JSON.stringify(config),/private-certificate-payload|private-password/);
 assert.throws(()=>signingConfiguration({...env,MEMOFLOW_CERTIFICATE_SHA1:'not-a-thumbprint'}),/指纹/);
 assert.equal(signingConfiguration({...env,MEMOFLOW_CERTIFICATE_SHA1:'A'.repeat(40)}).build.win.signtoolOptions.certificateSha1,'A'.repeat(40));
});
test('Azure mode validates official endpoint and required identity without copying secrets into config',()=>{
 const env={MEMOFLOW_WINDOWS_SIGNING:'azure',MEMOFLOW_SIGNING_PUBLISHER:'Example Publisher',MEMOFLOW_AZURE_SIGNING_ENDPOINT:'https://eus.codesigning.azure.net/',MEMOFLOW_AZURE_CERTIFICATE_PROFILE:'verified-profile',MEMOFLOW_AZURE_SIGNING_ACCOUNT:'signing-account',AZURE_CLIENT_ID:'client',AZURE_TENANT_ID:'tenant',AZURE_CLIENT_SECRET:'private-client-secret'};
 const config=signingConfiguration(env);assert.equal(config.build.forceCodeSigning,true);assert.equal(config.build.win.azureSignOptions.fileDigest,'SHA256');assert.doesNotMatch(JSON.stringify(config),/private-client-secret/);assert.throws(()=>signingConfiguration({...env,AZURE_CLIENT_SECRET:''}),/AZURE_CLIENT_SECRET/);
 for(const endpoint of ['http://eus.codesigning.azure.net/','https://codesigning.azure.net.attacker.test/','https://user:secret@eus.codesigning.azure.net/','https://eus.codesigning.azure.net/path'])assert.throws(()=>signingConfiguration({...env,MEMOFLOW_AZURE_SIGNING_ENDPOINT:endpoint}));
});
test('signature validation rejects unsigned files, wrong publishers and missing timestamps',()=>{
 const valid={file:'Fomo.exe',status:'Valid',subject:'CN=Verified Publisher, O=Example',commonName:'Verified Publisher',timestamped:true};
 assert.equal(validateSignature(valid,'Verified Publisher'),valid);assert.equal(validateSignature(valid,valid.subject),valid);
 assert.throws(()=>validateSignature({...valid,status:'NotSigned'},'Verified Publisher'),/不信任/);
 assert.throws(()=>validateSignature({...valid,status:'HashMismatch'},'Verified Publisher'),/不信任/);
 assert.throws(()=>validateSignature(valid,'Other Publisher'),/发布者/);
 assert.throws(()=>validateSignature({...valid,timestamped:false},'Verified Publisher'),/时间戳/);
});
