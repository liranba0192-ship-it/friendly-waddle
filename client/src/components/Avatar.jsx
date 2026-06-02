import { avatarColor, initial } from '../helpers.js';

export default function Avatar({ user, size = 32 }) {
  const style = { width: size, height: size, fontSize: size * 0.45 };
  if (user?.avatar) {
    return <img className="avatar" src={user.avatar} alt={user.username} style={style} />;
  }
  return (
    <span
      className="avatar avatar-fallback"
      style={{ ...style, background: avatarColor(user?.username) }}
    >
      {initial(user?.username)}
    </span>
  );
}
