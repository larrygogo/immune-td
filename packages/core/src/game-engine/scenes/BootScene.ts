import { Scene } from 'phaser';
import { wxLogin } from '@/platform/wx/wx-login';
import { type WxUserInfoButton, createUserInfoButton } from '@/platform/wx/wx-userinfo';
import { getShell } from '../../shell';
import { TEX } from '../asset-keys';
import { DPR } from '../dpr';
import { SPACING } from '../layout/spacing';
import { useLoadStore } from '../load-store';
import { COLOR, FONT, HEX, px } from '../style';
import { PhaserButton } from '../ui/phaser-button';

declare const wx: any;

const IS_WX = import.meta.env.VITE_PLATFORM === 'wx';

/** wx 强登录链路 require shell.authStore；H5 端 BootScene 走 IS_WX=false 分支不调用 */
function requireAuth() {
  const a = getShell().authStore;
  if (!a) throw new Error('[BootScene] shell.authStore 未注入（wx 强登录链路必需）');
  return a.getState();
}

/**
 * BootScene：只加载 SplashScene 本身渲染需要的最少资源（中心细胞 sprite）+
 * 启动 fonts 监听；完成后立即 start('HealthAdvisoryScene')（健康忠告屏 3s 后才到 SplashScene）。
 *
 * 主资源加载（所有 tower/pathogen sprites、BGM、SFX）迁到 SplashScene.create
 * 里 —— 那时 UI 已经绘制，进度条可以跟着真实进度涨。
 *
 * wx 端分支：
 * - 用 PNG 替代 SVG（wx 不支持 Blob，SVG 加载内部走 createObjectURL）
 * - 跳过 document.fonts / document.body / boot-loader DOM 操作
 * - **强登录**：先尝试 loadFromStorage（已有 token 直接放行）；否则
 *   wx.login → POST /api/auth/wechat-login，最多 retry 3 次（500/1500/4500ms 退避）；
 *   3 次都失败显示「重试」按钮，**不允许进 SplashScene**（spec § 12.1 无匿名）
 */
export class BootScene extends Scene {
  /** 登录态 UI 容器，重试时整体重建以避免老节点残留 */
  private wxLoginUi: Phaser.GameObjects.Container | null = null;
  /** 当前 wx 原生 userInfo 按钮（授权流程用），离开本 scene 前必须 destroy */
  private wxUserInfoBtn: WxUserInfoButton | null = null;

  constructor() {
    super('BootScene');
  }

  preload(): void {
    if (IS_WX) {
      // wx：用 PNG（macrophage-1.png 已被 wx-postbuild 拷到 wx-dist/assets/towers/）
      this.load.image(TEX.tower('macrophage', 1), 'assets/towers/macrophage-1.png');
    } else {
      // H5：SVG 无损缩放
      // raster 到 256：splash 显示 cellRadius*2=px(108)=216 buffer px (DPR=2)，0.84× 清晰
      this.load.svg(TEX.tower('macrophage', 1), '/assets/towers/macrophage-1.svg', {
        width: 256,
        height: 256,
      });
    }

    const set = useLoadStore.setState;
    if (IS_WX) {
      // wx 端没有 document.fonts API，假设字体就绪（fallback sans-serif）
      set({ fontsReady: true });
    } else {
      // H5：5s 兜底监听字体就绪（不阻塞）
      const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
        Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), ms))]);
      void withTimeout(document.fonts.ready, 5000).then(() => set({ fontsReady: true }));
    }
  }

  create(): void {
    if (IS_WX) {
      // wx 强登录链路：成功才 start SplashScene；失败画错误屏 + 重试按钮
      void this.runWxAutoLogin();
      return;
    }

    // H5 原行为：直接进 splash
    document.body.classList.add('boot-done');
    setTimeout(() => document.getElementById('boot-loader')?.remove(), 320);
    this.scene.start('HealthAdvisoryScene');
  }

  /**
   * wx 端启动主流程：
   * 1. 先 loadFromStorage —— 已有 token + /api/me 通过则进入"授权检查"
   * 2. 否则 wxLogin → wechatLogin，retry 最多 3 次（指数退避 500/1500/4500ms）
   * 3. 登录成功后检查 user.wechat_nickname：缺失则进强制授权流程，已 bind 直接 SplashScene
   * 4. 登录链路全部失败 → 显示错误屏 + 重试按钮
   */
  private async runWxAutoLogin(): Promise<void> {
    this.showLoadingUi('正在登录…');

    // 路径 A：localStorage 已有 token，校验 /api/me
    try {
      await requireAuth().loadFromStorage();
      if (requireAuth().isAuthenticated()) {
        this.proceedAfterLogin();
        return;
      }
    } catch {
      // loadFromStorage 内部已处理 token 失效清空，这里 catch 兜底
    }

    // 路径 B：wxLogin → wechatLogin，最多 3 次
    const backoffsMs = [500, 1500, 4500];
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
      try {
        if (attempt > 0) {
          this.showLoadingUi(`正在登录…（重试 ${attempt}/3）`);
          await new Promise<void>((res) => setTimeout(res, backoffsMs[attempt - 1] ?? 0));
        }
        const { code } = await wxLogin();
        await requireAuth().wechatLogin(code);
        this.proceedAfterLogin();
        return;
      } catch (e) {
        lastErr = e;
        console.warn(`[BootScene] wx auto-login attempt ${attempt + 1} failed:`, e);
      }
    }

    // 3 次都失败：错误屏 + 重试按钮（点了重新走整个流程）
    const msg = lastErr instanceof Error ? lastErr.message : '未知错误';
    this.showErrorUi(`登录失败，请检查网络后重试\n（${msg}）`);
  }

  /**
   * 登录成功后的分支：根据 user.wechat_nickname 是否已存在决定下一步
   * - 已有昵称 → 直接 SplashScene
   * - 没有 → 显示强制授权屏（必须用户点 wx.createUserInfoButton 授权才能继续）
   */
  private proceedAfterLogin(): void {
    const user = requireAuth().user;
    if (user?.wechat_nickname && user.wechat_nickname.length > 0) {
      this.clearWxLoginUi();
      this.scene.start('HealthAdvisoryScene');
      return;
    }
    this.showAuthorizeUi();
  }

  /**
   * 强制授权屏：黑底 + 提示 + Phaser 占位按钮 + 同位置覆盖透明 wx button。
   * 用户点 wx button → 拿 nickname/avatar → bind → SplashScene。
   * 用户拒绝 → toast + 重建按钮（让用户能再点一次）。
   */
  private showAuthorizeUi(): void {
    this.clearWxLoginUi();
    this.destroyWxUserInfoBtn();

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    const tip = this.add
      .text(cx, cy - px(SPACING.xl + SPACING.sm), '请授权微信资料以继续游戏', {
        fontFamily: FONT,
        fontSize: `${px(14)}px`,
        color: COLOR.primary,
        align: 'center',
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    const subTip = this.add
      .text(cx, cy - px(SPACING.md), '我们仅使用昵称与头像用于游戏内显示', {
        fontFamily: FONT,
        fontSize: `${px(11)}px`,
        color: COLOR.textDim,
        align: 'center',
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    const btnW = 200;
    const btnH = 44;
    // = px(30)：授权按钮距中心偏下
    const btnY = cy + px(SPACING.lg + SPACING.xs + 2);
    // Phaser 占位按钮（视觉），仅展示；真实点击事件靠覆盖的 wx 原生按钮
    const placeholder = new PhaserButton(this, cx, btnY, {
      label: '授权微信资料',
      width: btnW,
      height: btnH,
      fontSize: 14,
      color: HEX.primary,
      onTap: () => {
        // wx 原生按钮覆盖在上层，正常情况下点不到这里；保险用作 fallback toast
        if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
          wx.showToast({ title: '请点按钮授权', icon: 'none', duration: 1200 });
        }
      },
    });

    this.wxLoginUi = this.add.container(0, 0, [tip, subTip, placeholder.container]);

    // 在 PhaserButton 同位置覆盖透明 wx 原生按钮（buffer px → CSS px / DPR）
    // PhaserButton 默认 origin=center，所以 (cx, btnY) 是中心；left/top 是 CSS 坐标的左上
    const cssLeft = (cx - px(btnW) / 2) / DPR;
    const cssTop = (btnY - px(btnH) / 2) / DPR;
    try {
      console.log(
        '[BootScene auth] creating wx button at CSS',
        'left=',
        cssLeft,
        'top=',
        cssTop,
        'w=',
        btnW,
        'h=',
        btnH,
        '(buffer cx=',
        cx,
        'btnY=',
        btnY,
        'DPR=',
        DPR,
        ')',
      );
      this.wxUserInfoBtn = createUserInfoButton({
        left: cssLeft,
        top: cssTop,
        width: btnW,
        height: btnH,
      });
      console.log('[BootScene auth] wx button created OK');
      this.wxUserInfoBtn.onTap((res) => {
        console.log('[BootScene auth] wx button onTap', JSON.stringify({
          hasUserInfo: !!res.userInfo,
          errMsg: res.errMsg,
          nickName: res.userInfo?.nickName,
        }));
        void this.handleAuthorizeTap(res);
      });
    } catch (e) {
      console.error('[BootScene] createUserInfoButton failed:', e);
      this.showErrorUi(`授权按钮创建失败\n（${(e as Error).message}）`);
    }
  }

  /**
   * 处理 wx UserInfo button 的 onTap 结果：
   * - 同意 → bindWechatUserInfo + 进 SplashScene
   * - 拒绝 / userInfo 为 null → toast + 重建按钮（destroy 老的避免残留）
   * - bind 网络失败 → toast 提示 + 留在授权屏让重试
   */
  private async handleAuthorizeTap(res: {
    userInfo: { nickName: string; avatarUrl: string } | null;
    errMsg?: string;
  }): Promise<void> {
    if (!res.userInfo) {
      this.toast('未授权微信资料，无法进入游戏。请点按钮重试。');
      // 重建：销毁旧 wx button + showAuthorizeUi 重建 UI（包括新 wx button）
      this.showAuthorizeUi();
      return;
    }
    const { nickName, avatarUrl } = res.userInfo;
    this.showLoadingUi('正在保存资料…');
    this.destroyWxUserInfoBtn();
    try {
      await requireAuth().bindWechatUserInfo(nickName, avatarUrl);
      this.clearWxLoginUi();
      this.scene.start('HealthAdvisoryScene');
    } catch (e) {
      console.warn('[BootScene] bindWechatUserInfo failed:', e);
      this.toast(`保存失败：${(e as Error).message}`);
      // 失败留在授权屏 + 重建 wx button
      this.showAuthorizeUi();
    }
  }

  /** wx.showToast 包装；非 wx 环境（理论上跑不到这里）退化到 console */
  private toast(text: string): void {
    if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
      wx.showToast({ title: text, icon: 'none', duration: 1500 });
    } else {
      console.log('[BootScene] toast:', text);
    }
  }

  private destroyWxUserInfoBtn(): void {
    if (this.wxUserInfoBtn) {
      this.wxUserInfoBtn.destroy();
      this.wxUserInfoBtn = null;
    }
  }

  /** 画 / 更新 loading 文字（重建 UI 容器） */
  private showLoadingUi(text: string): void {
    this.clearWxLoginUi();
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const label = this.add
      .text(cx, cy, text, {
        fontFamily: FONT,
        fontSize: `${px(14)}px`,
        color: COLOR.primary,
        align: 'center',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    this.wxLoginUi = this.add.container(0, 0, [label]);
  }

  /** 画错误屏：标题 + 重试按钮 */
  private showErrorUi(text: string): void {
    this.clearWxLoginUi();
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // y 偏移 = px(30)：错误文字位于中心上方，留位置给重试按钮
    const label = this.add
      .text(cx, cy - px(SPACING.lg + SPACING.xs + 2), text, {
        fontFamily: FONT,
        fontSize: `${px(13)}px`,
        color: COLOR.danger,
        align: 'center',
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    // y 偏移 = px(30)：重试按钮位于中心下方，与标题 px(30) 对称
    const btn = new PhaserButton(this, cx, cy + px(SPACING.lg + SPACING.xs + 2), {
      label: '重试',
      width: 120,
      height: 40,
      fontSize: 13,
      color: HEX.primary,
      onTap: () => {
        void this.runWxAutoLogin();
      },
    });

    this.wxLoginUi = this.add.container(0, 0, [label, btn.container]);
  }

  /**
   * 清理上一次画的登录 UI（loading / 错误屏 / 授权屏）。
   * 同时销毁 wx 原生 userInfo button —— 该按钮浮在 canvas 之上、scene 切换不自动清理。
   */
  private clearWxLoginUi(): void {
    if (this.wxLoginUi) {
      this.wxLoginUi.destroy(true);
      this.wxLoginUi = null;
    }
    this.destroyWxUserInfoBtn();
  }
}
