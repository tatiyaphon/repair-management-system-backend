module.exports = (req, res, next) => {

  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ message: "No token" });
  }

  const token = header.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Invalid token format" });
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  req.user = {
    id: decoded.id,
    role: decoded.role
  };

  next();
};

