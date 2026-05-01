function shareInviteCode(family) {
  return {
    title: `加入"${family.name}"，一起守护家人血糖`,
    path: `/pages/join/join?code=${family.invite_code}`,
    imageUrl: '/images/share-card.png',
  }
}

module.exports = { shareInviteCode }
