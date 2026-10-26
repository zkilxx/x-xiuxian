# 顶部横幅修复

原生 image_gen 编辑用户指定的山水横幅。源图与导出图保存在 banner-restored-v2.png 和 extension/assets/mountain-banner-restored.png。

保留楼阁、中央群峰、右上月亮、右侧孤峰的横向构图；清除截屏左下旧头像金边。生成画布为 2172×724，其中完整金框画面位于 y=72 到 y=632；前端 SVG 仅去掉画布上下空边，完整画面按 2172:560 等比显示，无 cover 放大裁景，头像继续作为独立图层轻微覆盖下沿。

提示词：

> Precise-object-edit, a clean panoramic Chinese cultivation-game UI banner asset. Preserve the exact landscape composition of the supplied image: the large green-and-gold Chinese pavilion complex on the left, misty jagged mountains through the center, the full pale moon at upper right, the isolated dark pagoda tower on the far right, the original dark jade, pale ivory mist and warm antique gold palette. Preserve the ENTIRE scene and its original very wide 333:87 (~3.83:1) panoramic aspect ratio; no cropping, no zooming, no new subjects. ONLY remove the small curved GOLD AVATAR-RIM FRAGMENT entering from the bottom-left edge, repairing that tiny region with matching landscape. Keep the delicate rectangular gold corner frame if present, but no circular arcs, no avatar, no letters, no UI buttons. Produce the clean banner alone at the same very wide aspect ratio, with all edge landscape details visible. No outer page or padding, no mockup, no transparency.
