# Read-only infrastructure check from the Windows workstation.
# Resolves DNS and probes reachability of the panel and nodes. No secrets.
#
# Usage:  pwsh -File infra/scripts/check-infrastructure.ps1
#     or  powershell -ExecutionPolicy Bypass -File infra\scripts\check-infrastructure.ps1

$ErrorActionPreference = 'SilentlyContinue'

$targets = @(
  @{ Name='panel  (pulsar2)';     Host='panel.pulsar-cloud.space'; ExpectIP='31.76.27.41';   Tcp=@(443);      Udp=@() }
  @{ Name='site   (pulsar2)';     Host='pulsar-cloud.space';       ExpectIP='31.76.27.41';   Tcp=@(443);      Udp=@() }
  @{ Name='PL node (reality)';    Host='pl.pulsar-cloud.space';    ExpectIP='185.126.64.64'; Tcp=@(443);      Udp=@() }
  @{ Name='DE node (reality)';    Host='de.pulsar-cloud.space';    ExpectIP='2.26.230.109';  Tcp=@(443);      Udp=@() }
  @{ Name='NL node (hysteria2)';  Host='nl.pulsar-cloud.space';    ExpectIP='31.77.157.232'; Tcp=@();         Udp=@(443) }
  @{ Name='LTE origin';           Host='pulsarnet.top';            ExpectIP='';              Tcp=@(443);      Udp=@() }
)

function Test-Tcp([string]$h,[int]$p){
  try { $c=New-Object Net.Sockets.TcpClient; $iar=$c.BeginConnect($h,$p,$null,$null);
        $ok=$iar.AsyncWaitHandle.WaitOne(3000); if($ok){$c.EndConnect($iar)}; $c.Close(); return $ok }
  catch { return $false }
}

"{0,-22} {1,-26} {2,-16} {3}" -f 'Target','Host','DNS','Ports' | Write-Host
'-' * 90 | Write-Host
foreach ($t in $targets) {
  $ips = (Resolve-DnsName -Name $t.Host -Type A | Where-Object IPAddress | Select-Object -Expand IPAddress) -join ','
  $dns = if ($ips) { $ips } else { 'NXDOMAIN' }
  $mark = if ($t.ExpectIP -and $ips -notmatch [regex]::Escape($t.ExpectIP)) { ' (!)' } else { '' }

  $portInfo = @()
  foreach ($p in $t.Tcp) { $portInfo += ("tcp/{0}:{1}" -f $p, $(if (Test-Tcp $t.Host $p) {'open'} else {'closed'})) }
  foreach ($p in $t.Udp) { $portInfo += ("udp/{0}:probe-from-server" -f $p) }  # UDP open-check is unreliable from Windows

  "{0,-22} {1,-26} {2,-16} {3}" -f $t.Name, $t.Host, ($dns+$mark), ($portInfo -join '  ') | Write-Host
}
Write-Host ''
Write-Host 'Note: (!) = DNS does not match the expected IP. UDP (Hysteria2) must be verified from a server or a real client.'
