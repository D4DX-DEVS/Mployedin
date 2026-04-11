import subprocess, sys, os

os.chdir(r"c:\Users\moham\OneDrive\Desktop\Mployedin\mployedin")

result = subprocess.run(
    ["node", "node_modules\\.bin\\next", "build"],
    cwd=r"c:\Users\moham\OneDrive\Desktop\Mployedin\mployedin",
    capture_output=True,
    text=True,
    timeout=300,
    env={**os.environ, "NEXT_TELEMETRY_DISABLED": "1"}
)

combined = result.stdout + "\n" + result.stderr
print(combined)
print("EXIT CODE:", result.returncode)
